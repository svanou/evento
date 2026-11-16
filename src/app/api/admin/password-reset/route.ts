import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appUrl, localAdmin, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
const inputSchema = z.object({ email: z.email().max(254) });
const accepted = () =>
  NextResponse.json({
    message:
      "Si un compte correspond à cette adresse, un lien de réinitialisation va être envoyé. Consultez aussi vos courriers indésirables.",
  });

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== appUrl())
    return NextResponse.json(
      { error: "Origine non autorisée" },
      { status: 403 },
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (localAdmin() || !url || !key)
    return NextResponse.json(
      {
        error: "La réinitialisation par email est indisponible pour le moment.",
      },
      { status: 503 },
    );
  let email: string;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1024) throw new Error("Invalid input");
    email = inputSchema.parse(JSON.parse(raw)).email.trim().toLowerCase();
  } catch {
    return NextResponse.json(
      { error: "Saisissez une adresse email valide." },
      { status: 400 },
    );
  }
  try {
    await rateLimit("admin-recovery-global", 10, 3600_000);
    await rateLimit(`admin-recovery:${email}`, 1, 60_000);
  } catch {
    return NextResponse.json(
      { error: "Réessayez dans quelques minutes." },
      { status: 429 },
    );
  }
  try {
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    });
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl()}/admin/reset-password`,
    });
    if (
      error &&
      !["user_not_found", "email_not_found"].includes(error.code || "")
    )
      return NextResponse.json(
        {
          error:
            "L’envoi est indisponible pour le moment. Réessayez plus tard.",
        },
        { status: error.status === 429 ? 429 : 503 },
      );
    return accepted();
  } catch {
    return NextResponse.json(
      {
        error: "L’envoi est indisponible pour le moment. Réessayez plus tard.",
      },
      { status: 503 },
    );
  }
}
