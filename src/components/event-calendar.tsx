"use client";
import { useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { CalendarEvent } from "@/lib/community";
const categories = [
  "tout",
  "nature",
  "culture",
  "musique",
  "atelier",
  "marché",
];
export function EventCalendar({
  events,
  month,
  zone,
  today,
}: {
  events: CalendarEvent[];
  month: string;
  zone: string;
  today: string;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [category, setCategory] = useState("tout");
  const start = DateTime.fromISO(`${month}-01`).setLocale("fr");
  const filtered = events.filter(
    (e) => category === "tout" || e.category === category,
  );
  const visible = filtered.filter((e) => !day || e.date === day);
  const days = Array.from({ length: start.daysInMonth! }, (_, i) =>
    start.plus({ days: i }),
  );
  return (
    <>
      <div className="calendar-toolbar">
        <nav aria-label="Choisir le mois">
          <Link
            className="month-arrow"
            aria-label="Mois précédent"
            href={`/agenda-${zone}/calendrier?mois=${start.minus({ months: 1 }).toFormat("yyyy-MM")}`}
          >
            ←
          </Link>
          <h2>{start.toFormat("LLLL yyyy")}</h2>
          <Link
            className="month-arrow"
            aria-label="Mois suivant"
            href={`/agenda-${zone}/calendrier?mois=${start.plus({ months: 1 }).toFormat("yyyy-MM")}`}
          >
            →
          </Link>
        </nav>
        <Link
          href={`/agenda-${zone}/calendrier?mois=${today.slice(0, 7)}`}
          className="text-button"
        >
          Ce mois-ci
        </Link>
      </div>
      <div
        className="calendar-filters"
        role="group"
        aria-label="Filtrer les événements par catégorie"
      >
        {categories.map((c) => (
          <button
            key={c}
            className="chip"
            aria-pressed={category === c}
            onClick={() => {
              setCategory(c);
              setDay(null);
            }}
          >
            {c === "tout" ? "Toutes les sorties" : c}
          </button>
        ))}
      </div>
      <div className="calendar-layout">
        <div className="calendar-month">
          <div className="calendar-weekdays" aria-hidden="true">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="calendar-days"
            role="group"
            aria-label={`Jours de ${start.toFormat("LLLL yyyy")}`}
          >
            {Array.from({ length: start.weekday - 1 }, (_, i) => (
              <span key={`blank-${i}`} aria-hidden="true" />
            ))}
            {days.map((d) => {
              const iso = d.toISODate()!;
              const count = filtered.filter((e) => e.date === iso).length;
              return (
                <button
                  key={iso}
                  aria-label={`${d.toFormat("cccc d LLLL")}, ${count} événement${count === 1 ? "" : "s"}`}
                  aria-pressed={day === iso}
                  aria-current={today === iso ? "date" : undefined}
                  className={count ? "has-events" : ""}
                  onClick={() => setDay(day === iso ? null : iso)}
                >
                  <span>{d.day}</span>
                  <small aria-hidden="true">
                    {count ? `${count} sortie${count === 1 ? "" : "s"}` : "·"}
                  </small>
                </button>
              );
            })}
          </div>
          <p className="calendar-hint">
            Choisissez un jour pour composer votre programme.
          </p>
          {day && (
            <button className="text-button" onClick={() => setDay(null)}>
              Voir tout le mois
            </button>
          )}
          <div className="calendar-note">
            <strong>Le bon réflexe avant de partir</strong>
            <p>
              Consultez le site de l’organisateur pour les places disponibles et
              les changements de dernière minute. La date de notre vérification
              figure sur chaque sortie.
            </p>
          </div>
        </div>
        <section
          className="calendar-results"
          aria-label="Événements sélectionnés"
        >
          <p role="status" className="eyebrow">
            {visible.length} sortie{visible.length === 1 ? "" : "s"}{" "}
            {day
              ? `le ${DateTime.fromISO(day).setLocale("fr").toFormat("d LLLL")}`
              : "ce mois-ci"}
          </p>
          {!visible.length && (
            <div className="calendar-empty">
              <h3>Laissons de la place aux prochaines découvertes.</h3>
              <p>
                {day
                  ? "Aucune sortie publiée pour ce jour et ce filtre."
                  : "Aucune sortie publiée pour ce mois et ce filtre. Notre sélection s’enrichit au fil de la veille."}
              </p>
              <Link href={`/inscription?zone=${zone}`}>
                Recevoir les prochaines idées →
              </Link>
            </div>
          )}
          {visible.map((e) => (
            <article key={`${e.id}-${e.date}`} className="calendar-event">
              <div className="event-date">
                <strong>{DateTime.fromISO(e.date).day}</strong>
                <span>
                  {DateTime.fromISO(e.date).setLocale("fr").toFormat("LLL")}
                </span>
              </div>
              <div>
                <div className="tag-row">
                  <span className="tag">{e.category}</span>
                  <span>
                    {DateTime.fromISO(e.date).setLocale("fr").toFormat("cccc")}{" "}
                    · {e.time || "Horaire à confirmer"}
                  </span>
                </div>
                <h3>{e.title}</h3>
                <p className="event-place">{e.place}</p>
                <p>{e.description}</p>
                <p>
                  <strong>{e.price}</strong>
                  {e.organizerAge && (
                    <>
                      <br />
                      {e.organizerAge}
                    </>
                  )}
                </p>
                <p>
                  {e.booking === "yes"
                    ? "Inscription nécessaire · places à vérifier"
                    : e.booking === "no"
                      ? "Accès sans réservation selon la source"
                      : "Modalités de réservation non renseignées"}
                </p>
                <a
                  className="event-source-link"
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Infos et réservation · {e.sourceLabel} ↗
                </a>
                <small>
                  Source consultée le{" "}
                  {DateTime.fromISO(e.checkedAt)
                    .setLocale("fr")
                    .toFormat("dd/LL/yyyy")}
                </small>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
