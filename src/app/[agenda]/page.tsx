import { ZoneLanding } from "@/components/zone-landing";
import { zoneFor } from "@/lib/public-zone";
import { publicSources } from "@/lib/community";
export const dynamic = "force-dynamic";
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
  return (
    <ZoneLanding
      id={zone.id}
      name={zone.name}
      day={zone.send_day}
      sources={await publicSources(zone.id)}
    />
  );
}
