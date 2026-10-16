import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { query } from "@/lib/db";
import {
  signupSchema,
  editSchema,
  sourceSchema,
  type Content,
} from "@/lib/domain";
import {
  adminId,
  appUrl,
  localAdmin,
  equal,
  newToken,
  rateLimit,
  signAdmin,
  tokenOwner,
} from "@/lib/security";
import {
  approveNewsletter,
  cancelSchedule,
  confirmSubscriber,
  deleteSubscriber,
  editNewsletter,
  enqueue,
  getNewsletter,
  getSubscriber,
  listSources,
  newsletters,
  retryPreparation,
  scheduleNewsletter,
  subscribe,
  unsubscribe,
} from "@/lib/store";
import { getZone, listZones, saveZone } from "@/lib/zones";
import { renderEmail } from "@/lib/email";
import { broadcast, sendConfirmation } from "@/lib/delivery";
import { mailReadiness, requireRecipient } from "@/lib/mail-transport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieOptions = () => ({
  httpOnly: true,
  secure: appUrl().startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86400,
});
async function current(req: NextRequest) {
  const id = await tokenOwner(
    req.cookies.get("evento_subscriber")?.value || "",
    "session",
  );
  if (!id) throw new Error("AUTH_REQUIRED");
  return id;
}
function admin(req: NextRequest) {
  return adminId(req.cookies.get("evento_admin")?.value);
}
async function body(req: NextRequest): Promise<unknown> {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 32768)
    throw new Error("Requête trop volumineuse");
  return JSON.parse(raw);
}
async function handle(req: NextRequest) {
  const path = req.nextUrl.pathname.slice(5);
  try {
    if (req.method !== "GET" && req.headers.get("origin") !== appUrl())
      return NextResponse.json(
        { error: "Origine non autorisée" },
        { status: 403 },
      );
    if (path === "health" && req.method === "GET") {
      await query("SELECT 1");
      return NextResponse.json({
        ok: true,
        email: mailReadiness().enabled ? "configured" : "disabled",
      });
    }
    if (path === "zones" && req.method === "GET")
      return NextResponse.json({
        zones: await listZones(),
        registrationOpen: Object.values(mailReadiness()).every(Boolean),
      });
    if (path === "signup" && req.method === "POST") {
      await rateLimit("signup-global", 100, 3600_000);
      const input = signupSchema.parse(await body(req));
      requireRecipient(input.email);
      const created = await subscribe(input.email, input.zone);
      let confirmationSent = false;
      try {
        await sendConfirmation(created.subscriber!.id);
        confirmationSent = true;
      } catch {
        /* A pending subscriber may retry confirmation from their session. */
      }
      const res = NextResponse.json({
        subscriber: created.subscriber,
        confirmationSent,
      });
      res.cookies.set("evento_subscriber", created.session, cookieOptions());
      return res;
    }
    if (path === "me") {
      const id = await current(req);
      if (req.method === "GET") {
        const subscriber = await getSubscriber(id);
        if (!subscriber) throw new Error("AUTH_REQUIRED");
        const editions = (await newsletters(subscriber.zone)).filter(
          (n) => n.preparation_status === "approved",
        );
        return NextResponse.json({
          subscriber,
          zone: await getZone(subscriber.zone, true),
          editions,
          registrationOpen: Object.values(mailReadiness()).every(Boolean),
        });
      }
      if (req.method === "DELETE") {
        await deleteSubscriber(id);
        const res = NextResponse.json({ ok: true });
        res.cookies.delete("evento_subscriber");
        return res;
      }
    }
    if (path === "confirmation" && req.method === "POST") {
      const id = await current(req);
      await rateLimit(`confirm:${id}`, 5, 3600_000);
      await sendConfirmation(id);
      return NextResponse.json({ ok: true });
    }
    if (path === "link" && req.method === "POST") {
      const { token, purpose } = z
        .object({
          token: z.string().max(128),
          purpose: z.enum(["confirm", "manage", "unsubscribe"]),
        })
        .parse(await body(req));
      const id = await tokenOwner(token, purpose, true);
      if (!id) throw new Error("Lien expiré ou déjà utilisé");
      if (purpose === "confirm") await confirmSubscriber(id);
      if (purpose === "unsubscribe") {
        await unsubscribe(id);
        return NextResponse.json({ ok: true, unsubscribed: true });
      }
      const res = NextResponse.json({ ok: true });
      res.cookies.set(
        "evento_subscriber",
        await newToken(id, "session", 30 * 86400_000),
        cookieOptions(),
      );
      return res;
    }
    if (path === "unsubscribe" && req.method === "POST") {
      await unsubscribe(await current(req));
      return NextResponse.json({ ok: true });
    }
    const preview = path.match(/^newsletters\/([^/]+)\/email$/);
    if (preview && req.method === "GET") {
      const edition = await getNewsletter(preview[1]);
      if (!edition?.content) throw new Error("Édition non disponible");
      let manage = `${appUrl()}/mon-weekend`;
      let leave = `${appUrl()}/mon-weekend`;
      if (!admin(req)) {
        const id = await current(req);
        const subscriber = await getSubscriber(id);
        if (
          subscriber?.zone !== edition.zone ||
          edition.preparation_status !== "approved"
        )
          return NextResponse.json({ error: "Introuvable" }, { status: 404 });
        manage = `${appUrl()}/lien/manage#token=${await newToken(id, "manage", 7 * 86400_000)}`;
        leave = `${appUrl()}/lien/unsubscribe#token=${await newToken(id, "unsubscribe", 180 * 86400_000)}`;
      }
      const content = renderEmail(
        await getZone(edition.zone, true),
        JSON.parse(edition.content) as Content,
        { manage, unsubscribe: leave },
      );
      const plain = req.nextUrl.searchParams.get("format") === "text";
      return new NextResponse(plain ? content.text : content.html, {
        headers: {
          "Content-Type": plain
            ? "text/plain; charset=utf-8"
            : "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }
    if (path === "admin/login" && req.method === "POST") {
      await rateLimit("admin-login", 10, 15 * 60_000);
      const input = z
        .object({ email: z.string().optional(), password: z.string().max(256) })
        .parse(await body(req));
      let id: string | null = null;
      if (localAdmin()) {
        if (!process.env.DEV_ADMIN_PASSWORD)
          throw new Error("DEV_ADMIN_PASSWORD requis pour l’accès local");
        if (equal(input.password, process.env.DEV_ADMIN_PASSWORD))
          id = "local-admin";
      } else {
        const client = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const result = await client.auth.signInWithPassword({
          email: input.email || "",
          password: input.password,
        });
        if (
          !result.error &&
          result.data.user &&
          (process.env.ADMIN_USER_IDS || "")
            .split(",")
            .includes(result.data.user.id)
        )
          id = result.data.user.id;
      }
      if (!id)
        return NextResponse.json(
          { error: "Identifiants invalides" },
          { status: 401 },
        );
      const res = NextResponse.json({ ok: true });
      res.cookies.set("evento_admin", signAdmin(id), {
        ...cookieOptions(),
        maxAge: 8 * 3600,
      });
      return res;
    }
    if (path.startsWith("admin/")) {
      const actor = admin(req);
      if (!actor) throw new Error("AUTH_REQUIRED");
      if (path === "admin/logout" && req.method === "POST") {
        const res = NextResponse.json({ ok: true });
        res.cookies.delete("evento_admin");
        return res;
      }
      if (path === "admin/data" && req.method === "GET")
        return NextResponse.json({
          zones: await listZones(true),
          editions: await query(
            "SELECT * FROM zone_newsletters ORDER BY weekend DESC,created_at DESC",
          ),
          subscribers: await query(
            "SELECT id,email,zone,confirmed_at,unsubscribed_at,created_at FROM subscribers ORDER BY created_at DESC",
          ),
          sources: await query(
            "SELECT * FROM newsletter_sources ORDER BY zone,name",
          ),
          jobs: await query(
            "SELECT id,newsletter_id,status,attempt,error FROM newsletter_jobs ORDER BY created_at DESC",
          ),
          attempts: await query(
            "SELECT * FROM newsletter_attempts ORDER BY created_at DESC LIMIT 100",
          ),
          deliveries: await query(
            "SELECT id,newsletter_id,subscriber_id,state,error,updated_at FROM newsletter_deliveries ORDER BY updated_at DESC",
          ),
          audit: await query(
            "SELECT * FROM newsletter_audit ORDER BY created_at DESC LIMIT 100",
          ),
          configuration: {
            email: mailReadiness(),
            research: {
              keyConfigured: !!process.env.OPENAI_API_KEY,
              modelConfigured: !!process.env.OPENAI_MODEL,
            },
          },
        });
      if (path === "admin/prepare" && req.method === "POST") {
        const input = z
          .object({
            zone: z.string(),
            date: z.iso.datetime({ offset: true }).optional(),
          })
          .parse(await body(req));
        await rateLimit(`prepare:${input.zone}`, 10, 3600_000);
        return NextResponse.json({
          edition: await enqueue(
            input.zone,
            input.date ? new Date(input.date) : undefined,
          ),
        });
      }
      if (path === "admin/zones" && ["POST", "PATCH"].includes(req.method))
        return NextResponse.json({
          zone: await saveZone(await body(req), req.method === "POST"),
        });
      if (path === "admin/sources" && ["POST", "PATCH"].includes(req.method)) {
        const input = z
          .object({
            zone: z.string(),
            id: z.string().optional(),
            source: sourceSchema,
          })
          .parse(await body(req));
        await getZone(input.zone, true);
        if (req.method === "PATCH") {
          if (!input.id) throw new Error("Source introuvable");
          const changed = await query(
            "UPDATE newsletter_sources SET name=$1,url=$2,enabled=$3,notes=$4 WHERE id=$5 AND zone=$6 RETURNING id",
            [
              input.source.name,
              input.source.url,
              input.source.enabled ? 1 : 0,
              input.source.notes,
              input.id,
              input.zone,
            ],
          );
          if (!changed.length) throw new Error("Source introuvable");
        } else
          await query(
            "INSERT INTO newsletter_sources(id,zone,name,url,enabled,notes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              randomUUID(),
              input.zone,
              input.source.name,
              input.source.url,
              input.source.enabled ? 1 : 0,
              input.source.notes,
              Date.now(),
            ],
          );
        return NextResponse.json({ ok: true });
      }
      const action = path.match(
        /^admin\/newsletters\/([^/]+)\/(edit|approve|schedule|cancel|retry|send)$/,
      );
      if (action && req.method === "POST") {
        const [, id, op] = action;
        if (op === "edit")
          await editNewsletter(id, editSchema.parse(await body(req)), actor);
        if (op === "approve") {
          const input = z
            .object({ revision: z.number().int() })
            .parse(await body(req));
          await approveNewsletter(id, input.revision, actor);
        }
        if (op === "schedule") {
          const input = z
            .object({
              revision: z.number().int(),
              at: z.iso.datetime({ offset: true }),
            })
            .parse(await body(req));
          await scheduleNewsletter(id, input.revision, input.at, actor);
        }
        if (op === "cancel") await cancelSchedule(id, actor);
        if (op === "retry") await retryPreparation(id);
        if (op === "send") return NextResponse.json(await broadcast(id));
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Route introuvable" }, { status: 404 });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")} : ${i.message}`)
            .join(" · "),
        },
        { status: 400 },
      );
    const message = e instanceof Error ? e.message : "Erreur inattendue";
    if (message === "AUTH_REQUIRED")
      return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
    if (
      /SQL|connect|password authentication|constraint|relation|ENOENT/i.test(
        message,
      )
    )
      return NextResponse.json(
        {
          error:
            "Stockage indisponible : vérifier la connexion et les migrations.",
        },
        { status: 503 },
      );
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
