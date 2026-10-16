import { DateTime } from "luxon";
import {
  candidateSchema,
  type Candidate,
  type Content,
  type Weekend,
  type Zone,
} from "./domain";
export function buildEdition(
  zone: Zone,
  weekend: Weekend,
  candidates: Candidate[],
  now = new Date(),
): Content {
  const seen = new Set<string>();
  const reviews = candidates.map((raw) => {
    const candidate = candidateSchema.parse(raw);
    const reasons: string[] = [];
    const doubts: string[] = [];
    const fingerprint = `${candidate.title
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      )}|${candidate.date}|${candidate.place.toLowerCase()}`;
    if (seen.has(fingerprint)) reasons.push("Doublon d’une autre sortie");
    seen.add(fingerprint);
    if (candidate.zone !== zone.id)
      reasons.push("Hors de la zone de cette édition");
    if (![weekend.saturday, weekend.sunday].includes(candidate.date))
      reasons.push("Hors du week-end concerné");
    const date = DateTime.fromISO(
      `${candidate.date}T${candidate.time || "23:59"}`,
      { zone: zone.timezone },
    );
    if (date.toMillis() <= now.getTime())
      reasons.push("Événement passé ou déjà commencé");
    if (candidate.conflict) reasons.push("Contradiction entre les sources");
    if (!candidate.occurrenceConfirmed)
      doubts.push("Occurrence non confirmée pour ces dates");
    if (candidate.sourceYear !== date.year)
      doubts.push("Année de la source incorrecte");
    if (
      now.getTime() - Date.parse(candidate.checkedAt) > 48 * 3600_000 ||
      Date.parse(candidate.checkedAt) > now.getTime() + 60_000
    )
      doubts.push("Vérification trop ancienne ou datée dans le futur");
    if (candidate.fictitious)
      reasons.push(
        "Une fiche fictive ne peut pas être publiée dans une édition réelle",
      );
    return {
      candidate,
      decision: reasons.length
        ? ("excluded" as const)
        : doubts.length
          ? ("check" as const)
          : ("included" as const),
      reasons: [...reasons, ...doubts],
    };
  });
  let count = 0;
  for (const review of reviews)
    if (review.decision === "included" && ++count > 5) {
      review.decision = "excluded";
      review.reasons.push("Limite éditoriale de cinq sorties");
    }
  return {
    subject: `${zone.name} : on fait quoi ce week-end ?`,
    introduction: `Une sélection locale pour profiter du week-end dans votre zone : ${zone.name}. Des idées à partager, des sources à consulter, et la liberté de choisir.`,
    articles: reviews
      .filter((r) => r.decision === "included")
      .map((r) => r.candidate),
    sponsor: null,
    reviews,
    metrics: {
      calls: 1,
      durationMs: 0,
      tokens: null,
      measuredCost: null,
      estimatedCost: null,
    },
  };
}
