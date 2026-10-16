import { randomUUID } from "node:crypto";
import { type Profile, type Candidate, weekendFor } from "../src/lib/domain";
import { DemoDiscovery } from "../src/lib/providers";
export const now = new Date("2026-10-09T06:00:00Z");
export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.test`,
    origin: "Gex",
    country: "FR",
    timezone: "Europe/Paris",
    language: "fr",
    group: "family",
    adults: 2,
    childrenAges: [5, 8],
    interests: ["nature", "culture", "créativité"],
    availability: ["sat-am", "sat-pm", "sun-am", "sun-pm"],
    budget: 40,
    currency: "EUR",
    preferFree: true,
    transport: [{ mode: "transit", maxMinutes: 30 }],
    crossBorder: true,
    stroller: false,
    accessible: false,
    setting: "any",
    consent: true,
    revision: 1,
    zone: "gex-geneva",
    confirmedAt: null,
    unsubscribedAt: null,
    trialUsed: 0,
    subscription: "trial",
    createdAt: now.getTime(),
    ...overrides,
  };
}
export async function candidates(): Promise<Candidate[]> {
  const list = await new DemoDiscovery().discover(
    "gex-geneva",
    weekendFor(now, "Europe/Paris"),
    AbortSignal.timeout(1000),
  );
  return list.map((c) => ({
    ...c,
    evidence: c.evidence.map((e) => ({ ...e, checkedAt: now.toISOString() })),
  }));
}
export function preferences(p = profile()) {
  const {
    id,
    revision,
    zone,
    confirmedAt,
    unsubscribedAt,
    trialUsed,
    subscription,
    createdAt,
    ...input
  } = p;
  return input;
}
