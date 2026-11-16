import Link from "next/link";
import { DateTime } from "luxon";
import { zoneFor } from "@/lib/public-zone";
import { calendarEvents } from "@/lib/community";
import { EventCalendar } from "@/components/event-calendar";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ agenda: string }>;
}) {
  const { agenda } = await params;
  const zone = await zoneFor(agenda);
  return {
    title: `Calendrier des événements · ${zone?.name ?? "Evento"}`,
    robots: {
      index: process.env.SEARCH_INDEXING_ENABLED === "true",
      follow: true,
    },
    alternates: { canonical: `/${agenda}/calendrier` },
  };
}
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ agenda: string }>;
  searchParams: Promise<{ mois?: string }>;
}) {
  const { agenda } = await params;
  const zone = await zoneFor(agenda);
  if (!zone)
    return (
      <section className="empty-state">
        <h1>Le calendrier est momentanément indisponible.</h1>
        <p>Merci de revenir un peu plus tard.</p>
      </section>
    );
  const today = DateTime.now().setZone(zone.timezone).toISODate()!;
  const { mois } = await searchParams;
  const month =
    typeof mois === "string" &&
    /^\d{4}-\d{2}$/.test(mois) &&
    DateTime.fromISO(`${mois}-01`).isValid
      ? mois
      : today.slice(0, 7);
  const events = await calendarEvents(zone.id, month);
  return (
    <section className="calendar-page">
      <Link className="zone-back" href={`/${agenda}`}>
        ← La newsletter {zone.name}
      </Link>
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">{zone.name.toUpperCase()} · L’AGENDA LOCAL</p>
          <h1>
            Des dates.
            <br />
            Et de belles idées<span className="orange">.</span>
          </h1>
          <p>
            Les sorties repérées par Evento, réunies dans un calendrier.
            <br />
            Des sources visibles, pour organiser votre prochaine escapade.
          </p>
        </div>
        <Link className="button primary" href={`/inscription?zone=${zone.id}`}>
          Recevoir la sélection →
        </Link>
      </div>
      <EventCalendar
        key={month}
        events={events}
        month={month}
        zone={zone.id}
        today={today}
      />
    </section>
  );
}
