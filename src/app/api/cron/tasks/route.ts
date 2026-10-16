import { NextRequest, NextResponse } from "next/server";
import { equal } from "@/lib/security";
import { runAutomation } from "@/lib/automation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: "Cron non configuré" }, { status: 503 });
  if (!equal(req.headers.get("authorization") || "", `Bearer ${secret}`))
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return NextResponse.json(await runAutomation({ source: "cron" }));
  } catch {
    return NextResponse.json(
      {
        error:
          "Traitement interrompu : consulter les tentatives et la configuration.",
      },
      { status: 503 },
    );
  }
}
