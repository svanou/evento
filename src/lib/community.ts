import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { query } from "./db";
import {
  candidateSchema,
  type Candidate,
  type Content,
  type Source,
} from "./domain";
import { audit, getNewsletter } from "./store";
import { getZone } from "./zones";
import { buildEdition } from "./pipeline";
import { referenceNow } from "./clock";

export type PublicSource = Pick<
  Source,
  "id" | "zone" | "name" | "url" | "description" | "visual"
>;
export async function publicSources(zone: string): Promise<PublicSource[]> {
  return query<PublicSource>(
    "SELECT id,zone,name,url,description,visual FROM newsletter_sources WHERE zone=$1 AND enabled=1 ORDER BY name",
    [zone],
  );
}
function belongsToSources(candidate: Candidate, sources: PublicSource[]) {
  const host = new URL(candidate.sourceUrl).hostname.replace(/^www\./, "");
  return sources.some((s) => {
    const domain = new URL(s.url).hostname.replace(/^www\./, "");
    return (
      s.zone === candidate.zone &&
      (host === domain || host.endsWith(`.${domain}`))
    );
  });
}
export type CalendarEvent = Omit<
  Candidate,
  | "sourceExcerpt"
  | "fictitious"
  | "conflict"
  | "occurrenceConfirmed"
  | "sourceYear"
>;
export function calendarArticles(
  content: Content,
  zone: string,
  sources: PublicSource[],
): CalendarEvent[] {
  return content.articles.flatMap((raw) => {
    const parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) return [];
    const a = parsed.data;
    if (
      a.zone !== zone ||
      a.fictitious ||
      a.conflict ||
      !a.occurrenceConfirmed ||
      !belongsToSources(a, sources)
    )
      return [];
    if (
      !content.reviews.some(
        (r) =>
          r.decision === "included" &&
          r.candidate.id === a.id &&
          r.candidate.sourceUrl === a.sourceUrl &&
          r.candidate.date === a.date,
      )
    )
      return [];
    return [
      {
        id: a.id,
        zone: a.zone,
        title: a.title,
        description: a.description,
        date: a.date,
        time: a.time,
        place: a.place,
        category: a.category,
        price: a.price,
        free: a.free,
        organizerAge: a.organizerAge,
        booking: a.booking,
        sourceUrl: a.sourceUrl,
        sourceLabel: a.sourceLabel,
        checkedAt: a.checkedAt,
      },
    ];
  });
}
export async function calendarEvents(zone: string, month: string) {
  const start = DateTime.fromISO(`${month}-01`);
  if (!/^\d{4}-\d{2}$/.test(month) || !start.isValid)
    throw new Error("Mois invalide");
  const [rows, sources] = await Promise.all([
    query<{ content: string }>(
      "SELECT content FROM zone_newsletters WHERE zone=$1 AND calendar_revision=revision AND calendar_published_at IS NOT NULL AND content IS NOT NULL AND weekend >= $2 AND weekend <= $3 ORDER BY updated_at DESC",
      [
        zone,
        start.minus({ days: 1 }).toISODate(),
        start.endOf("month").toISODate(),
      ],
    ),
    publicSources(zone),
  ]);
  const seen = new Set<string>();
  return rows
    .flatMap((r) =>
      calendarArticles(JSON.parse(r.content) as Content, zone, sources),
    )
    .filter((a) => {
      const key = `${a.sourceUrl}|${a.date}|${a.time}`;
      if (!a.date.startsWith(month) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      `${a.date} ${a.time ?? "23:59"}`.localeCompare(
        `${b.date} ${b.time ?? "23:59"}`,
      ),
    );
}
export async function publishCalendar(
  id: string,
  revision: number,
  published: boolean,
  actor: string,
) {
  const edition = await getNewsletter(id);
  if (!edition || edition.revision !== revision)
    throw new Error("Édition modifiée entre-temps. Rechargez-la.");
  if (published) {
    const zone = await getZone(edition.zone);
    if (
      !edition.content ||
      !["ready", "approved"].includes(edition.preparation_status)
    )
      throw new Error("Édition non prête");
    const content = JSON.parse(edition.content) as Content;
    const eligible = calendarArticles(
      content,
      zone.id,
      await publicSources(zone.id),
    );
    const checked = buildEdition(
      zone,
      {
        key: edition.weekend,
        saturday: edition.weekend,
        sunday: DateTime.fromISO(edition.weekend)
          .plus({ days: 1 })
          .toISODate()!,
        timezone: zone.timezone,
      },
      content.articles,
      referenceNow(),
    );
    if (
      !eligible.length ||
      eligible.length !== content.articles.length ||
      checked.articles.length !== eligible.length
    )
      throw new Error(
        "Recontrôlez les dates, les sources actives et les preuves (moins de 48 h) avant publication.",
      );
  }
  const changed = await query(
    "UPDATE zone_newsletters SET calendar_revision=$1,calendar_published_at=$2 WHERE id=$3 AND revision=$4 RETURNING id",
    [published ? revision : null, published ? Date.now() : null, id, revision],
  );
  if (!changed.length)
    throw new Error("Édition modifiée entre-temps. Rechargez-la.");
  await audit(
    id,
    published ? "calendar_published" : "calendar_unpublished",
    actor,
    revision,
  );
}
export const sponsorInquirySchema = z
  .object({
    zone: z.string().min(1).max(60),
    name: z.string().trim().min(2).max(150),
    email: z.email().max(254),
    message: z.string().trim().min(10).max(2000),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .strict();
export type SponsorInquiry = {
  id: string;
  zone: string;
  name: string;
  email: string;
  message: string;
  created_at: number;
};
export async function saveSponsorInquiry(raw: unknown) {
  const input = sponsorInquirySchema.parse(raw);
  if (input.website) return;
  await getZone(input.zone);
  await query(
    "INSERT INTO sponsor_inquiries(id,zone,name,email,message,created_at) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      input.zone,
      input.name,
      input.email.toLowerCase(),
      input.message,
      Date.now(),
    ],
  );
}
