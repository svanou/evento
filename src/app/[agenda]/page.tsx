import { notFound } from "next/navigation";
import { ZoneLanding } from "@/components/zone-landing";
import { getZone } from "@/lib/zones";
export const dynamic = "force-dynamic";
async function zoneFor(agenda: string) {
  if (!agenda.startsWith("agenda-")) notFound();
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
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ agenda: string }>;
}) {
  const { agenda } = await params;
  const zone = await zoneFor(agenda);
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
  return <ZoneLanding id={zone.id} name={zone.name} day={zone.send_day} />;
}
