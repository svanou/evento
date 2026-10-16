import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { query } from "@/lib/db";
import { profileSchema, type Edition, type Selection } from "@/lib/domain";
import {
  adminId,
  appUrl,
  demo,
  equal,
  newToken,
  rateLimit,
  signAdmin,
  tokenOwner,
} from "@/lib/security";
import {
  approveEdition,
  createProfile,
  deleteProfile,
  editProfile,
  editionsFor,
  enqueue,
  getProfile,
  mutateProfile,
  unsubscribe,
} from "@/lib/store";
import { renderEmail } from "@/lib/email";

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
    req.cookies.get("evento_session")?.value || "",
    "session",
  );
  if (!id) throw new Error("AUTH_REQUIRED");
  return id;
}
function isAdmin(req: NextRequest) {
  return !!adminId(req.cookies.get("evento_admin")?.value);
}
function requireAdmin(req: NextRequest) {
  if (!isAdmin(req)) throw new Error("AUTH_REQUIRED");
}
async function body(req: NextRequest): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 16384)
    throw new Error("Requête trop volumineuse");
  return JSON.parse(raw);
}
async function handle(req: NextRequest) {
  const path = req.nextUrl.pathname.slice(5);
  const method = req.method;
  try {
    if (method !== "GET" && req.headers.get("origin") !== appUrl())
      return NextResponse.json(
        { error: "Origine non autorisée" },
        { status: 403 },
      );
    if (path === "health") {
      await query("SELECT 1");
      return NextResponse.json({ ok: true, demo: demo(), email: "disabled" });
    }
    if (path === "signup" && method === "POST") {
      await rateLimit("signup-global", 100, 3600_000);
      const input = profileSchema.parse(await body(req));
      if (!demo())
        throw new Error(
          "L’inscription réelle sera ouverte après activation du fournisseur de confirmation. Utilisez la démonstration.",
        );
      const created = await createProfile(input);
      const response = NextResponse.json({
        profile: created.profile,
        confirmationLink: `/lien/confirm#token=${created.confirm}`,
      });
      response.cookies.set("evento_session", created.session, cookieOptions());
      return response;
    }
    if (path === "me") {
      const id = await current(req);
      if (method === "GET")
        return NextResponse.json({
          profile: await getProfile(id),
          editions: await editionsFor(id),
          demo: demo(),
        });
      if (method === "PATCH")
        return NextResponse.json({
          profile: await editProfile(id, profileSchema.parse(await body(req))),
        });
      if (method === "DELETE") {
        await deleteProfile(id);
        const r = NextResponse.json({ ok: true });
        r.cookies.delete("evento_session");
        return r;
      }
    }
    if (path === "confirmation" && method === "POST") {
      if (!demo()) throw new Error("Envoi de confirmation non configuré");
      const id = await current(req);
      await rateLimit(`confirm:${id}`, 5, 3600_000);
      return NextResponse.json({
        confirmationLink: `/lien/confirm#token=${await newToken(id, "confirm", 24 * 3600_000)}`,
      });
    }
    if (path === "link" && method === "POST") {
      const { token, purpose } = z
        .object({
          token: z.string().max(128),
          purpose: z.enum(["confirm", "manage", "unsubscribe"]),
        })
        .parse(await body(req));
      const id = await tokenOwner(token, purpose, true);
      if (!id)
        return NextResponse.json(
          { error: "Lien expiré ou déjà utilisé." },
          { status: 400 },
        );
      if (purpose === "confirm")
        await mutateProfile(id, (p) => ({ ...p, confirmedAt: Date.now() }));
      if (purpose === "unsubscribe") {
        await unsubscribe(id);
        return NextResponse.json({ ok: true, unsubscribed: true });
      }
      const session = await newToken(id, "session", 30 * 86400_000);
      const response = NextResponse.json({ ok: true });
      response.cookies.set("evento_session", session, cookieOptions());
      return response;
    }
    if (path === "unsubscribe" && method === "POST") {
      await unsubscribe(await current(req));
      return NextResponse.json({ ok: true });
    }
    if (path === "prepare" && method === "POST") {
      const id = await current(req);
      await rateLimit(`prepare:${id}`, 10, 3600_000);
      return NextResponse.json({ edition: await enqueue(id) });
    }
    if (path === "feedback" && method === "POST") {
      const id = await current(req);
      const input = z
        .object({
          editionId: z.string().uuid(),
          candidateId: z.string().max(100),
          kind: z.enum(["interested", "not-for-me", "too-far", "known"]),
        })
        .parse(await body(req));
      const edition = (
        await query<Edition>(
          "SELECT * FROM editions WHERE id=$1 AND profile_id=$2",
          [input.editionId, id],
        )
      )[0];
      if (
        !edition?.data ||
        !(JSON.parse(edition.data) as Selection).items.some(
          (i) =>
            i.decision === "selected" && i.candidate.id === input.candidateId,
        )
      )
        throw new Error("Proposition introuvable");
      await query(
        "INSERT INTO feedback(id,profile_id,edition_id,candidate_id,kind,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id,edition_id,candidate_id) DO UPDATE SET kind=$5,created_at=$6",
        [
          randomUUID(),
          id,
          input.editionId,
          input.candidateId,
          input.kind,
          Date.now(),
        ],
      );
      return NextResponse.json({
        ok: true,
        suggestion:
          input.kind === "too-far"
            ? "Réduisez votre durée maximale dans vos préférences si vous le souhaitez."
            : input.kind === "not-for-me"
              ? "Vous pouvez modifier vos centres d’intérêt. Aucune préférence n’a été déduite automatiquement."
              : input.kind === "known"
                ? "Cette activité sera exclue des prochaines préparations."
                : "Merci ! Votre intérêt est enregistré.",
      });
    }
    const emailMatch = path.match(/^editions\/([^/]+)\/email$/);
    if (emailMatch && method === "GET") {
      const edition = (
        await query<Edition>("SELECT * FROM editions WHERE id=$1", [
          emailMatch[1],
        ])
      )[0];
      if (
        !edition ||
        (!isAdmin(req) && edition.profile_id !== (await current(req)))
      )
        return NextResponse.json({ error: "Introuvable" }, { status: 404 });
      if (!edition.data) throw new Error("Préparation en cours");
      const profile = await getProfile(edition.profile_id);
      if (!profile) throw new Error("Profil introuvable");
      const manage = await newToken(profile.id, "manage", 7 * 86400_000);
      const unsubscribe = await newToken(
        profile.id,
        "unsubscribe",
        180 * 86400_000,
      );
      const content = renderEmail(profile, JSON.parse(edition.data), {
        manage: `${appUrl()}/lien/manage#token=${manage}`,
        unsubscribe: `${appUrl()}/lien/unsubscribe#token=${unsubscribe}`,
      });
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
    if (path === "admin/login" && method === "POST") {
      await rateLimit("admin-login", 10, 15 * 60_000);
      const input = z
        .object({ email: z.string().optional(), password: z.string().max(256) })
        .parse(await body(req));
      let id: string | null = null;
      if (demo()) {
        if (
          equal(
            input.password,
            process.env.DEMO_ADMIN_PASSWORD || "evento-demo-local",
          )
        )
          id = "demo-admin";
      } else {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const result = await supabase.auth.signInWithPassword({
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
      const response = NextResponse.json({ ok: true });
      response.cookies.set("evento_admin", signAdmin(id), {
        ...cookieOptions(),
        maxAge: 8 * 3600,
      });
      return response;
    }
    if (path.startsWith("admin/")) {
      requireAdmin(req);
      if (path === "admin/logout" && method === "POST") {
        const r = NextResponse.json({ ok: true });
        r.cookies.delete("evento_admin");
        return r;
      }
      if (path === "admin/data" && method === "GET") {
        return NextResponse.json({
          profiles: (
            await query<{ data: string }>(
              "SELECT data FROM profiles ORDER BY created_at DESC",
            )
          ).map((p) => JSON.parse(p.data)),
          editions: await query(
            "SELECT * FROM editions ORDER BY created_at DESC",
          ),
          jobs: await query(
            "SELECT id,edition_id,status,attempt,error,run_after FROM jobs ORDER BY created_at DESC",
          ),
          attempts: await query(
            "SELECT * FROM job_attempts ORDER BY created_at DESC LIMIT 100",
          ),
          deliveries: await query(
            "SELECT * FROM deliveries ORDER BY updated_at DESC",
          ),
          demo: demo(),
        });
      }
      if (path === "admin/prepare" && method === "POST") {
        const { profileId } = z
          .object({ profileId: z.string().uuid() })
          .parse(await body(req));
        return NextResponse.json({ edition: await enqueue(profileId) });
      }
      if (path === "admin/approve" && method === "POST") {
        const input = z
          .object({
            editionId: z.string().uuid(),
            keepIds: z.array(z.string()).max(5),
          })
          .parse(await body(req));
        await approveEdition(input.editionId, input.keepIds);
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Route introuvable" }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")} : ${i.message}`)
            .join(" · "),
        },
        { status: 400 },
      );
    const message =
      error instanceof Error ? error.message : "Erreur inattendue";
    if (message === "AUTH_REQUIRED")
      return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
    // Do not echo database errors or connection strings to the browser.
    if (
      /SQL|connect|password authentication|constraint|relation|ENOENT/i.test(
        message,
      )
    )
      return NextResponse.json(
        { error: "Stockage indisponible. Vérifiez sa configuration." },
        { status: 503 },
      );
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
