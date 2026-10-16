import { notFound } from "next/navigation";
import { ZoneLanding } from "@/components/zone-landing";
import { getZone } from "@/lib/zones";
import { databaseSetupRequired } from "@/lib/deployment";
import { cache } from "react";
export const dynamic = "force-dynamic";
const zoneFor = cache(async (agenda: string) => {
  if (!agenda.startsWith("agenda-")) notFound();
  if (databaseSetupRequired()) {
    console.error(
      "[Evento: DATABASE_URL_MISSING] Configurer DATABASE_URL sur Vercel, appliquer les migrations Supabase, puis redéployer.",
    );
    return null;
  }
  try {
    return await getZone(agenda.slice(7));
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "Cette zone n’est pas encore ouverte."
    )
      notFound();
    throw e;
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ agenda: string }>;
}) {
  const { agenda } = await params;
  const zone = await zoneFor(agenda);
  if (!zone)
    return {
      title: "Evento — Newsletter momentanément indisponible",
      robots: { index: false, follow: false },
    };
  return {
    title: `${zone.name} — Newsletter gratuite des sorties | Evento`,
    description: `Les idées de sorties du week-end dans votre zone : ${zone.name}, dans une newsletter gratuite.`,
    robots: {
      index: process.env.SEARCH_INDEXING_ENABLED === "true",
      follow: true,
    },
    alternates: { canonical: `/agenda-${zone.id}` },
  };
}
export default async function Agenda({
  params,
}: {
  params: Promise<{ agenda: string }>;
}) {
  const { agenda } = await params;
  const zone = await zoneFor(agenda);
  if (!zone)
    return (
      <section className="empty-state">
        <p className="eyebrow">EVENTO · LES SORTIES DE VOTRE COIN</p>
        <h1>La newsletter est momentanément indisponible.</h1>
        <p>
          Les inscriptions ne sont pas encore accessibles. Merci de revenir un
          peu plus tard.
        </p>
        <a className="button secondary" href={`/${agenda}`}>
          Réessayer
        </a>
      </section>
    );
  return <ZoneLanding id={zone.id} name={zone.name} day={zone.send_day} />;
}
