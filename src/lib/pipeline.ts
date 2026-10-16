import { DateTime } from "luxon";
import {
  type Assessed,
  type Candidate,
  type Profile,
  type Selection,
  type Weekend,
  modeLabels,
  safeSourceUrl,
} from "./domain";
import type { RoutingProvider } from "./providers";
import { withDeadline } from "./deadline";

function fingerprint(c: Candidate): string {
  const normalized = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return `${normalized(c.title)}|${DateTime.fromISO(c.start).toMillis()}|${normalized(c.place)}`;
}

export async function selectCandidates(input: {
  profile: Profile;
  candidates: Candidate[];
  weekend: Weekend;
  routing: RoutingProvider;
  demo: boolean;
  now?: Date;
  alreadySeen?: Set<string>;
  maxCalls?: number;
  signal?: AbortSignal;
}): Promise<Selection> {
  const started = Date.now();
  const now = input.now || new Date();
  const signal = input.signal || AbortSignal.timeout(45000);
  const maxCalls = input.maxCalls ?? 8;
  let calls = 0;
  const { profile, weekend } = input;
  const seen = new Set<string>();
  const items: Assessed[] = [];
  // Evaluate hard facts before spending route calls; then rank by explicit interests.
  const sorted = [...input.candidates].sort((a, b) => score(b) - score(a));
  function score(c: Candidate) {
    return (
      c.interests.filter((i) =>
        profile.interests.includes(i as Profile["interests"][number]),
      ).length *
        10 +
      (profile.preferFree && c.price?.amount === 0 ? 4 : 0)
    );
  }
  for (const candidate of sorted) {
    signal.throwIfAborted();
    const reasons: string[] = [];
    const unknown: string[] = [];
    const start = DateTime.fromISO(candidate.start, { setZone: true }).setZone(
      profile.timezone,
    );
    const key = fingerprint(candidate);
    if (seen.has(key)) reasons.push("Doublon d’une autre proposition");
    seen.add(key);
    if (input.alreadySeen?.has(key))
      reasons.push("Déjà proposée ou signalée comme déjà connue");
    if (!start.isValid || !DateTime.fromISO(candidate.end).isValid)
      reasons.push("Date invalide");
    if (start.toMillis() <= now.getTime())
      reasons.push("Événement passé ou déjà commencé");
    if (![weekend.saturday, weekend.sunday].includes(start.toISODate()!))
      reasons.push("Hors du week-end concerné");
    if (candidate.conflict) reasons.push("Contradiction entre les sources");
    if (!candidate.recurringConfirmed)
      unknown.push("Occurrence récurrente non confirmée pour ces dates");
    const slot = `${start.weekday === 6 ? "sat" : "sun"}-${start.hour < 12 ? "am" : "pm"}`;
    if (!profile.availability.includes(slot as Profile["availability"][number]))
      reasons.push("Hors des disponibilités");
    if (!profile.crossBorder && candidate.country !== profile.country)
      reasons.push("Passage de frontière non autorisé");
    if (profile.setting !== "any" && candidate.setting !== profile.setting) {
      (candidate.setting ? reasons : unknown).push(
        "Condition intérieur/extérieur non satisfaite ou inconnue",
      );
    }
    for (const field of ["stroller", "accessible"] as const) {
      if (profile[field] && candidate[field] !== true)
        (candidate[field] === false ? reasons : unknown).push(
          field === "stroller"
            ? "Accès poussette non confirmé"
            : "Accessibilité non confirmée",
        );
    }
    if (
      candidate.organizerAge &&
      profile.childrenAges.some(
        (age) =>
          age < candidate.organizerAge!.min ||
          (candidate.organizerAge!.max !== null &&
            age > candidate.organizerAge!.max),
      )
    )
      reasons.push("Âge hors de la plage annoncée par l’organisateur");
    let totalPrice: number | null = null;
    if (!candidate.price)
      unknown.push("Tarif non renseigné : budget invérifiable");
    else if (
      candidate.price.amount !== 0 &&
      candidate.price.currency !== profile.currency
    )
      unknown.push("Budget dans une autre devise : conversion non vérifiée");
    else {
      totalPrice =
        candidate.price.amount *
        (candidate.price.basis === "person"
          ? profile.adults + profile.childrenAges.length
          : 1);
      if (totalPrice > profile.budget) reasons.push("Budget total dépassé");
    }
    const trusted =
      candidate.evidence.length > 0 &&
      candidate.evidence.every(
        (e) => safeSourceUrl(e.url) && (input.demo || !e.fictitious),
      );
    if (!trusted || (!input.demo && candidate.fictitious))
      unknown.push("Source fiable vérifiable manquante");
    if (candidate.evidence.some((e) => e.year !== start.year))
      unknown.push("Année de la source différente de l’événement");
    if (
      candidate.evidence.some(
        (e) =>
          !Number.isFinite(Date.parse(e.checkedAt)) ||
          Date.parse(e.checkedAt) > now.getTime() + 60_000 ||
          now.getTime() - Date.parse(e.checkedAt) > 48 * 3600_000,
      )
    )
      unknown.push("Vérification de la source trop ancienne ou invalide");
    let route: Assessed["route"] = null;
    if (!reasons.length && !unknown.length) {
      for (const transport of profile.transport) {
        if (calls >= maxCalls) break;
        calls++;
        const attempt = await withDeadline(
          input.routing.route(profile, candidate, transport.mode, signal),
          signal,
        );
        route = attempt;
        const eligible =
          attempt.status === "verified" ||
          (input.demo &&
            candidate.fictitious &&
            attempt.status === "simulated");
        if (
          eligible &&
          attempt.minutes !== null &&
          attempt.minutes <= transport.maxMinutes
        )
          break;
      }
      if (
        !route ||
        route.minutes === null ||
        (route.status !== "verified" &&
          !(input.demo && candidate.fictitious && route.status === "simulated"))
      )
        unknown.push("Trajet non vérifié : durée maximale non garantie");
      else {
        const max = profile.transport.find(
          (m) => m.mode === route!.mode,
        )!.maxMinutes;
        if (route.minutes > max)
          reasons.push("Durée de trajet supérieure au maximum autorisé");
      }
    }
    const matches = candidate.interests.filter((i) =>
      profile.interests.includes(i as Profile["interests"][number]),
    );
    const relevance = matches.length
      ? `Pour votre envie de ${matches.join(" et ")}${candidate.price?.amount === 0 && profile.preferFree ? ", avec une entrée gratuite" : ""}.`
      : "Une découverte en dehors de vos centres d’intérêt habituels.";
    const decision = reasons.length
      ? "rejected"
      : unknown.length
        ? "alternative"
        : "selected";
    items.push({
      candidate,
      decision,
      reasons: [...reasons, ...unknown],
      relevance,
      route,
      score: score(candidate),
      totalPrice,
      constraintStatus:
        decision !== "selected"
          ? "unverified"
          : input.demo
            ? "simulated"
            : "verified",
    });
  }
  let selected = 0;
  for (const item of items) {
    if (item.decision === "selected" && ++selected > 5) {
      item.decision = "rejected";
      item.reasons.push("Limite de cinq propositions atteinte");
    }
  }
  return {
    items,
    weekend,
    demo: input.demo,
    metrics: {
      calls,
      durationMs: Date.now() - started,
      tokens: null,
      measuredCost: null,
      estimatedCost: null,
      currency: "USD",
    },
  };
}
export const candidateFingerprint = fingerprint;
