import { z } from "zod";
import { DateTime } from "luxon";

export type Zone = {
  id: string;
  name: string;
  timezone: string;
  country: string;
  currency: string;
  language: string;
  status: "draft" | "active";
  send_day: number;
  send_hour: number;
};
export const zoneSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
      .max(60),
    name: z.string().trim().min(2).max(100),
    timezone: z
      .string()
      .refine((s) => DateTime.now().setZone(s).isValid, "Fuseau invalide"),
    country: z.string().regex(/^[A-Z]{2}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    language: z.literal("fr"),
    status: z.enum(["draft", "active"]),
    send_day: z.number().int().min(1).max(5),
    send_hour: z.number().int().min(0).max(23),
  })
  .strict();
export function safeSourceUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(\.\d+)*)$/i.test(
        u.hostname,
      ) &&
      u.hostname.includes(".")
    );
  } catch {
    return false;
  }
}
export const httpsUrl = z
  .string()
  .max(1500)
  .refine(safeSourceUrl, "Une URL publique HTTPS est requise");
export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    zone: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .max(60),
    consent: z.literal(true, { error: "Votre accord est nécessaire." }),
  })
  .strict();
export type Subscriber = {
  id: string;
  email: string;
  zone: string;
  confirmed_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
};
export type Weekend = {
  key: string;
  saturday: string;
  sunday: string;
  timezone: string;
};
export function weekendFor(now: Date, timezone: string): Weekend {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  if (!local.isValid) throw new Error("Fuseau horaire invalide");
  const saturday = local
    .startOf("day")
    .plus({ days: local.weekday === 7 ? -1 : 6 - local.weekday });
  return {
    key: saturday.toISODate()!,
    saturday: saturday.toISODate()!,
    sunday: saturday.plus({ days: 1 }).toISODate()!,
    timezone,
  };
}
export function defaultSendAt(
  weekend: Weekend,
  zone: Pick<Zone, "send_day" | "send_hour"> = { send_day: 4, send_hour: 8 },
): string {
  return DateTime.fromISO(weekend.saturday, { zone: weekend.timezone })
    .minus({ days: 6 - zone.send_day })
    .set({ hour: zone.send_hour })
    .toISO()!;
}
export const candidateSchema = z
  .object({
    id: z.string().min(1).max(100),
    zone: z.string().min(1).max(80),
    title: z.string().min(1).max(180),
    description: z.string().min(1).max(1600),
    date: z
      .string()
      .refine(
        (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid,
        "Date invalide",
      ),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    place: z.string().min(1).max(250),
    category: z.enum(["nature", "culture", "musique", "atelier", "marché"]),
    price: z.string().min(1).max(250),
    free: z.boolean().nullable(),
    organizerAge: z.string().max(250).nullable(),
    booking: z.enum(["yes", "no", "unknown"]),
    sourceUrl: httpsUrl,
    sourceLabel: z.string().min(1).max(180),
    sourceExcerpt: z.string().min(1).max(2500),
    sourceYear: z.number().int(),
    checkedAt: z.iso.datetime({ offset: true }),
    fictitious: z.boolean(),
    conflict: z.boolean(),
    occurrenceConfirmed: z.boolean(),
  })
  .strict();
export type Candidate = z.infer<typeof candidateSchema>;
export type Review = {
  candidate: Candidate;
  decision: "included" | "excluded" | "check";
  reasons: string[];
};
export const sponsorSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(700),
    url: httpsUrl,
  })
  .strict();
export type Sponsor = z.infer<typeof sponsorSchema>;
export type Content = {
  research?: {
    responseId: string | null;
    sources: string[];
    toolCalls: number;
  };
  subject: string;
  introduction: string;
  articles: Candidate[];
  sponsor: Sponsor | null;
  reviews: Review[];
  metrics: {
    calls: number;
    durationMs: number;
    tokens: number | null;
    measuredCost: number | null;
    estimatedCost: number | null;
  };
};
export type Newsletter = {
  id: string;
  zone: string;
  weekend: string;
  revision: number;
  preparation_status: "queued" | "processing" | "ready" | "approved" | "failed";
  send_status:
    "not_scheduled" | "scheduled" | "blocked" | "sending" | "sent" | "failed";
  approved_revision: number | null;
  scheduled_at: number | null;
  content: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};
export const editSchema = z
  .object({
    revision: z.number().int().positive(),
    subject: z.string().trim().min(1).max(160),
    introduction: z.string().trim().min(1).max(2000),
    articles: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            title: z.string().trim().min(1).max(180),
            description: z.string().trim().min(1).max(1600),
          })
          .strict(),
      )
      .max(5)
      .refine(
        (a) => new Set(a.map((i) => i.id)).size === a.length,
        "Proposition dupliquée",
      ),
    sponsor: sponsorSchema.nullable(),
  })
  .strict();
export type Edit = z.infer<typeof editSchema>;
export type Source = {
  id: string;
  zone: string;
  name: string;
  url: string;
  enabled: number;
  notes: string;
  created_at: number;
};
export const sourceSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    url: httpsUrl,
    notes: z.string().max(1000),
    enabled: z.boolean(),
  })
  .strict();
