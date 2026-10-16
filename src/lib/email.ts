import { DateTime } from "luxon";
import { type Profile, type Selection, modeLabels, money } from "./domain";
import { appUrl } from "./security";

export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/** Copy is assembled exclusively from structured, validated data. No generative embellishment. */
export function renderEmail(
  profile: Profile,
  selection: Selection,
  links: { manage: string; unsubscribe: string },
) {
  const items = selection.items.filter((i) => i.decision === "selected");
  const date = (iso: string, zone: string) =>
    DateTime.fromISO(iso)
      .setZone(zone)
      .setLocale("fr")
      .toFormat("cccc d LLLL 'à' HH:mm");
  const heading = `${selection.demo ? "[DÉMONSTRATION] " : ""}Votre week-end, bien trouvé.`;
  const text = [
    heading,
    selection.demo
      ? "Tous les événements, sources et trajets ci-dessous sont fictifs. Aucune sortie réelle n’a été recherchée."
      : "Votre sélection vérifiée.",
    `${items.length} idée(s) pour le week-end du ${selection.weekend.saturday}.`,
    ...items.map((item, index) => {
      const c = item.candidate;
      const route = item.route;
      return [
        `${index + 1}. ${c.title}`,
        `${date(c.start, c.timezone)} (${c.timezone}) · ${c.place}`,
        c.description,
        item.relevance,
        `${money(c.price, item.totalPrice)}${c.price?.amount ? " pour le groupe" : ""}`,
        c.organizerAge
          ? `Âge annoncé par l’organisateur : ${c.organizerAge.min} ans minimum${c.organizerAge.max !== null ? `, ${c.organizerAge.max} ans maximum` : ""}.`
          : "Âge non précisé par l’organisateur.",
        c.booking === null
          ? "Réservation : information inconnue."
          : c.booking
            ? "Réservation nécessaire, disponibilité non vérifiée."
            : "Sans réservation annoncée.",
        route?.minutes !== null && route
          ? `${route.minutes} min ${modeLabels[route.mode]} · ${route.status === "simulated" ? "SIMULATION, contrainte réelle non vérifiée" : route.status === "verified" ? "trajet vérifié" : "non vérifié"}.`
          : "Trajet non vérifié.",
        route?.mode === "bike"
          ? "Adaptation du trajet aux enfants non vérifiée."
          : "",
        ...c.evidence.map(
          (e) =>
            `Source${e.fictitious ? " fictive" : ""} : ${e.url} · vérification${e.fictitious ? " simulée" : ""} : ${e.checkedAt}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    }),
    items.length
      ? ""
      : "Aucune proposition ne respecte les contraintes vérifiables de ce profil.",
    `Gérer mes préférences : ${links.manage}`,
    `Me désinscrire : ${links.unsubscribe}`,
    "4 éditions hebdomadaires gratuites, puis 2 €/mois, facturés annuellement (24 €/an). Aucun paiement actif.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const e = escapeHtml;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(heading)}</title></head><body style="margin:0;background:#f6f4ed;color:#233c32;font:16px/1.65 Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 24px"><a href="${e(appUrl())}" style="font-size:28px;color:#233c32;text-decoration:none;font-weight:bold">evento<span style="color:#e67f53">.</span></a><p style="font-size:12px;letter-spacing:2px">VOTRE DOSE D’AIR FRAIS</p><h1 style="font:40px/1.1 Georgia,serif">Votre week-end,<br>bien trouvé.</h1>${selection.demo ? '<p style="padding:16px;background:#fbe9bd;border-radius:12px"><b>DÉMONSTRATION</b> — Événements, sources et trajets fictifs. Ne pas utiliser pour organiser une sortie réelle.</p>' : ""}<p>${items.length} idée(s) choisie(s) selon vos préférences, au départ de ${e(profile.origin)}.</p>${items
    .map((item, index) => {
      const c = item.candidate;
      return `<article style="background:white;padding:24px;margin:20px 0;border-radius:16px"><small>0${index + 1} · ${e(money(c.price, item.totalPrice))}</small><h2 style="font:27px Georgia,serif;margin:8px 0">${e(c.title)}</h2><p>${e(date(c.start, c.timezone))} (${e(c.timezone)})<br>${e(c.place)}</p><p>${e(c.description)}</p><p style="color:#49775d">${e(item.relevance)}</p><p>${c.organizerAge ? `Âge organisateur : dès ${c.organizerAge.min} ans${c.organizerAge.max !== null ? `, jusqu’à ${c.organizerAge.max} ans` : ""}` : "Âge organisateur non précisé"}. ${c.booking === null ? "Réservation inconnue" : c.booking ? "Réservation requise ; disponibilité inconnue" : "Sans réservation annoncée"}.</p><p>${item.route?.minutes !== null && item.route ? `${item.route.minutes} min ${e(modeLabels[item.route.mode])} · ${item.route.status === "simulated" ? "trajet fictif, contrainte réelle non vérifiée" : "trajet vérifié"}` : "Trajet non vérifié"}${item.route?.mode === "bike" ? ". Adaptation aux enfants non vérifiée" : ""}.</p>${c.evidence.map((source) => `<p style="font-size:12px"><a href="${e(source.url)}" rel="noopener noreferrer" style="color:#2f6246">${e(source.label)}</a><br>Vérification${source.fictitious ? " simulée" : ""} : ${e(source.checkedAt)}</p>`).join("")}</article>`;
    })
    .join(
      "",
    )}${!items.length ? "<p>Aucune proposition conforme. Vos contraintes sont conservées.</p>" : ""}<p style="font-size:13px"><a href="${e(links.manage)}" style="color:#233c32">Gérer mes préférences et donner mon avis</a> · <a href="${e(links.unsubscribe)}" style="color:#233c32">Me désinscrire</a></p><p style="font-size:12px;color:#6e756f">4 éditions gratuites, puis 2 €/mois, facturés annuellement (24 €/an). Aucun paiement actif.</p></div></body></html>`;
  return { subject: heading, html, text };
}
