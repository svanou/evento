import { DateTime } from "luxon";
import type { Candidate, Profile, Route, Weekend, Mode } from "./domain";
import { referenceNow } from "./clock";

export interface DiscoveryProvider {
  discover(
    zone: string,
    weekend: Weekend,
    signal: AbortSignal,
  ): Promise<Candidate[]>;
}
export interface RoutingProvider {
  route(
    profile: Profile,
    candidate: Candidate,
    mode: Mode,
    signal: AbortSignal,
  ): Promise<Route>;
}
export interface EmailProvider {
  /** Implementations must honor the same idempotency key across retries. */
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
}

export class DemoDiscovery implements DiscoveryProvider {
  async discover(
    _zone: string,
    weekend: Weekend,
    signal: AbortSignal,
  ): Promise<Candidate[]> {
    signal.throwIfAborted();
    const at = (day: string, hour: number) =>
      DateTime.fromISO(day, { zone: "Europe/Paris" }).set({ hour }).toISO()!;
    const checkedAt = referenceNow().toISOString();
    const year = Number(weekend.key.slice(0, 4));
    const base = {
      timezone: "Europe/Paris",
      booking: false,
      stroller: true,
      accessible: true,
      conflict: false,
      recurringConfirmed: true,
      fictitious: true,
    };
    const specs: Array<
      Partial<Candidate> &
        Pick<
          Candidate,
          | "id"
          | "title"
          | "place"
          | "country"
          | "interests"
          | "description"
          | "setting"
        >
    > = [
      {
        id: "forest",
        title: "La forêt à hauteur d’enfant",
        place: "Bois de Gex · lieu fictif",
        country: "FR",
        interests: ["nature", "sport"],
        description:
          "Un petit parcours sensoriel entre les arbres, avec des pauses pour observer, toucher et écouter.",
        setting: "outdoor",
        price: { amount: 0, currency: "EUR", basis: "group" },
        organizerAge: { min: 3, max: null },
      },
      {
        id: "clay",
        title: "Les mains dans la terre",
        place: "Atelier des possibles, Gex · lieu fictif",
        country: "FR",
        interests: ["créativité", "culture"],
        description:
          "Modeler une petite pièce en argile et repartir avec une création qui ne ressemble à aucune autre.",
        setting: "indoor",
        booking: true,
        price: { amount: 6, currency: "EUR", basis: "person" },
        organizerAge: { min: 4, max: null },
      },
      {
        id: "music",
        title: "Un dimanche en musique",
        place: "Jardin des sons, Ferney-Voltaire · lieu fictif",
        country: "FR",
        interests: ["musique", "culture"],
        description:
          "Un concert acoustique en plein air, à écouter tranquillement avec un pique-nique.",
        setting: "outdoor",
        price: { amount: 0, currency: "EUR", basis: "group" },
        organizerAge: null,
      },
      {
        id: "market",
        title: "Le petit marché des saveurs",
        place: "Place des artisans, Gex · lieu fictif",
        country: "FR",
        interests: ["gastronomie", "créativité"],
        description:
          "Rencontrer des artisans et découvrir leur savoir-faire. Les achats sur place restent facultatifs.",
        setting: "outdoor",
        price: { amount: 0, currency: "EUR", basis: "group" },
        organizerAge: null,
      },
      {
        id: "museum",
        title: "Voyage dans les couleurs",
        place: "Maison des couleurs, Genève · lieu fictif",
        country: "CH",
        interests: ["culture", "créativité"],
        description:
          "Une visite ludique et colorée, ponctuée de petits défis d’observation.",
        setting: "indoor",
        price: { amount: 0, currency: "CHF", basis: "group" },
        organizerAge: { min: 5, max: null },
      },
      {
        id: "lake",
        title: "Pause au bord de l’eau",
        place: "Rive de Carouge · lieu fictif",
        country: "CH",
        interests: ["nature", "sport"],
        description:
          "Une promenade guidée pour prendre le temps d’observer les oiseaux de la rive.",
        setting: "outdoor",
        price: null,
        accessible: null,
        stroller: null,
        organizerAge: null,
      },
      {
        id: "unknown-route",
        title: "Le jardin secret",
        place: "Jardin éloigné · lieu fictif",
        country: "FR",
        interests: ["nature"],
        description: "Une visite dont le trajet reste à vérifier.",
        setting: "outdoor",
        price: { amount: 0, currency: "EUR", basis: "group" },
        organizerAge: null,
      },
    ];
    const candidates = specs.map(
      (s, i) =>
        ({
          ...base,
          ...s,
          start: at(i % 2 ? weekend.sunday : weekend.saturday, i % 3 ? 14 : 10),
          end: at(i % 2 ? weekend.sunday : weekend.saturday, i % 3 ? 16 : 12),
          evidence: [
            {
              url: `https://example.org/demo/${s.id}`,
              label: "Fiche de démonstration — source fictive",
              excerpt: `Donnée simulée : ${s.title}. Aucun événement réel n’est annoncé par cette fiche.`,
              checkedAt,
              year,
              fictitious: true,
            },
          ],
        }) as Candidate,
    );
    // Deliberately include bad candidates to exercise review and rejection.
    candidates.push({ ...candidates[0], id: "forest-duplicate" });
    candidates.push({
      ...candidates[1],
      id: "old",
      title: "Atelier de l’an dernier",
      start: at(`${year - 1}-06-01`, 10),
      end: at(`${year - 1}-06-01`, 12),
    });
    candidates.push({
      ...candidates[2],
      id: "conflict",
      title: "Concert aux horaires contradictoires",
      conflict: true,
    });
    return candidates;
  }
}

export class DemoRouting implements RoutingProvider {
  async route(
    _profile: Profile,
    candidate: Candidate,
    mode: Mode,
    signal: AbortSignal,
  ): Promise<Route> {
    signal.throwIfAborted();
    // Fixed fictional fixtures, never inferred from geographic distances.
    const minutes =
      candidate.id === "unknown-route"
        ? null
        : { transit: 24, walk: 38, bike: 18, car: 16 }[mode];
    return {
      mode,
      minutes,
      status: minutes === null ? "unknown" : "simulated",
      departure: candidate.start,
      checkedAt: new Date().toISOString(),
      provider: "Fournisseur fictif — aucun itinéraire calculé",
      childSuitable: null,
    };
  }
}

export class DisabledEmail implements EmailProvider {
  async send(): Promise<{ id: string }> {
    throw new Error(
      "Les envois sont désactivés. Prévisualisation locale uniquement.",
    );
  }
}
