// Synthetic records for automated tests ONLY. Never imported by application code.
import { DateTime } from "luxon";
import { type Candidate, type Zone, type Weekend } from "../src/lib/domain";
import { type DiscoveryProvider } from "../src/lib/providers";
export const now = new Date("2026-10-16T06:00:00Z");
export const testZone: Zone = {
  id: "pays-de-gex",
  name: "Pays de Gex",
  country: "FR",
  timezone: "Europe/Paris",
  currency: "EUR",
  language: "fr",
  status: "active",
  send_day: 4,
  send_hour: 8,
};
export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "test-only-event",
    zone: "pays-de-gex",
    title: "Test de sélection",
    description: "Donnée utilisée uniquement par les tests automatiques.",
    date: "2026-10-17",
    time: null,
    place: "Lieu du test",
    category: "culture",
    price: "Tarif non renseigné",
    free: null,
    organizerAge: null,
    booking: "unknown",
    sourceUrl: "https://example.org/tests/event",
    sourceLabel: "Source du test",
    sourceExcerpt: "Extrait de test.",
    sourceYear: 2026,
    checkedAt: now.toISOString(),
    fictitious: false,
    conflict: false,
    occurrenceConfirmed: true,
    ...overrides,
  };
}
export class TestDiscovery implements DiscoveryProvider {
  constructor(private clock = now) {}
  async discover(zone: Zone, weekend: Weekend): Promise<Candidate[]> {
    return [
      candidate({
        zone: zone.id,
        date: weekend.saturday,
        sourceYear: Number(weekend.saturday.slice(0, 4)),
        checkedAt: this.clock.toISOString(),
      }),
    ];
  }
}
