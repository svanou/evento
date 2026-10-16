import { z } from "zod";
import { DateTime, IANAZone } from "luxon";

export const interests = [
  "nature",
  "culture",
  "gastronomie",
  "sport",
  "créativité",
  "musique",
] as const;
export const modes = ["transit", "walk", "bike", "car"] as const;
export type Mode = (typeof modes)[number];
export const modeLabels: Record<Mode, string> = {
  transit: "transports publics",
  walk: "à pied",
  bike: "à vélo",
  car: "en voiture",
};
export const slots = ["sat-am", "sat-pm", "sun-am", "sun-pm"] as const;
export const profileSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase().trim()),
    origin: z.string().trim().min(2).max(100),
    country: z.enum(["FR", "CH"]),
    timezone: z
      .string()
      .refine((s) => IANAZone.isValidZone(s), "Fuseau horaire invalide"),
    language: z.enum(["fr", "en", "de"]),
    group: z.enum(["solo", "couple", "friends", "family"]),
    adults: z.number().int().min(1).max(20),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(10),
    interests: z.array(z.enum(interests)).min(1).max(6),
    availability: z.array(z.enum(slots)).min(1).max(4),
    budget: z.number().min(0).max(10000),
    currency: z.enum(["EUR", "CHF"]),
    preferFree: z.boolean(),
    transport: z
      .array(
        z.object({
          mode: z.enum(modes),
          maxMinutes: z.number().int().min(1).max(240),
        }),
      )
      .min(1)
      .max(4)
      .refine(
        (items) => new Set(items.map((x) => x.mode)).size === items.length,
      ),
    crossBorder: z.boolean(),
    stroller: z.boolean(),
    accessible: z.boolean(),
    setting: z.enum(["any", "indoor", "outdoor"]),
    consent: z.literal(true, {
      error: "Votre accord est nécessaire pour préparer vos éditions.",
    }),
  })
  .strict();
export type Preferences = z.infer<typeof profileSchema>;
export type Profile = Preferences & {
  id: string;
  revision: number;
  zone: "gex-geneva" | "waiting";
  confirmedAt: number | null;
  unsubscribedAt: number | null;
  trialUsed: number;
  subscription: "trial" | "active" | "expired";
  createdAt: number;
};
export type Weekend = {
  key: string;
  saturday: string;
  sunday: string;
  timezone: string;
};
export type Evidence = {
  url: string;
  label: string;
  excerpt: string;
  checkedAt: string;
  year: number;
  fictitious: boolean;
};
export type Candidate = {
  id: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  place: string;
  country: "FR" | "CH";
  description: string;
  interests: string[];
  price: {
    amount: number;
    currency: "EUR" | "CHF";
    basis: "person" | "group";
  } | null;
  organizerAge: { min: number; max: number | null } | null;
  booking: boolean | null;
  stroller: boolean | null;
  accessible: boolean | null;
  setting: "indoor" | "outdoor" | null;
  evidence: Evidence[];
  conflict: boolean;
  recurringConfirmed: boolean;
  fictitious: boolean;
};
export type Route = {
  mode: Mode;
  minutes: number | null;
  status: "verified" | "simulated" | "unknown";
  departure: string;
  checkedAt: string;
  provider: string;
  childSuitable: boolean | null;
};
export type Assessed = {
  candidate: Candidate;
  decision: "selected" | "alternative" | "rejected";
  reasons: string[];
  relevance: string;
  route: Route | null;
  score: number;
  totalPrice: number | null;
  constraintStatus: "verified" | "simulated" | "unverified";
};
export type Selection = {
  items: Assessed[];
  weekend: Weekend;
  demo: boolean;
  metrics: {
    calls: number;
    durationMs: number;
    tokens: number | null;
    measuredCost: number | null;
    estimatedCost: number | null;
    currency: "USD";
  };
};
export type Edition = {
  id: string;
  profile_id: string;
  weekend: string;
  revision: number;
  status: "queued" | "processing" | "ready" | "approved" | "failed";
  data: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};

/** During a weekend, include only future events from that weekend. Monday–Friday: next Saturday. */
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

export function fridayDue(now: Date, timezone: string): boolean {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  return local.weekday === 5 && local.hour >= 8;
}

export function zoneFor(origin: string, country: string): Profile["zone"] {
  const key = origin
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  const towns: Record<string, string[]> = {
    FR: [
      "gex",
      "ferney-voltaire",
      "saint-genis-pouilly",
      "divonne-les-bains",
      "prevessin-moens",
      "thoiry",
      "cessy",
      "ornex",
      "segny",
    ],
    CH: ["geneve", "geneva", "carouge", "meyrin", "vernier", "lancy"],
  };
  return towns[country]?.includes(key) ? "gex-geneva" : "waiting";
}

export function money(
  price: Candidate["price"],
  total?: number | null,
): string {
  if (!price) return "Tarif non renseigné";
  if (price.amount === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: price.currency,
  }).format(total ?? price.amount);
}

export function safeSourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(\.\d+)*)$/i.test(
        url.hostname,
      ) &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}
