import { DateTime } from "luxon";
import { type Content, type Zone } from "./domain";
export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function renderEmail(
  zone: Zone,
  content: Content,
  links: { manage: string; unsubscribe: string },
) {
  if (content.articles.some((a) => a.fictitious))
    throw new Error("Publication de données fictives interdite");
  const e = escapeHtml;
  const date = (iso: string) =>
    DateTime.fromISO(iso).setLocale("fr").toFormat("cccc d LLLL yyyy");
  const subject = content.subject;
  const sponsor = content.sponsor;
  const footer = `Newsletter gratuite pour les lecteurs, financée par des partenaires locaux. Les contenus sponsorisés sont identifiés et séparés de la sélection.`;
  const text = [
    subject,
    content.introduction,
    ...content.articles.map((a, i) =>
      [
        `${i + 1}. ${a.title}`,
        `${date(a.date)} · ${a.time || "horaire non renseigné"} (${zone.timezone}) · ${a.place}`,
        a.description,
        a.price,
        `Âge annoncé : ${a.organizerAge || "non renseigné"}.`,
        `Réservation : ${a.booking === "yes" ? "requise ; disponibilité inconnue" : a.booking === "no" ? "non requise selon la source" : "information inconnue"}.`,
        `Source : ${a.sourceLabel} — ${a.sourceUrl}`,
        `Source consultée le : ${a.checkedAt}`,
      ].join("\n"),
    ),
    sponsor
      ? `PUBLICITÉ — PARTENAIRE LOCAL\n${sponsor.name}\n${sponsor.title}\n${sponsor.body}\n${sponsor.url}`
      : "",
    footer,
    `Gérer mon abonnement : ${links.manage}`,
    `Me désinscrire : ${links.unsubscribe}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head><body style="margin:0;background:#f7f6f0;color:#273e32;font:16px/1.7 Arial,sans-serif"><main style="max-width:640px;padding:32px 24px;margin:auto"><p style="font-size:30px;font-weight:bold">evento.</p><p style="font-size:12px;letter-spacing:2px">LE RENDEZ-VOUS DU ${e(zone.name.toUpperCase())}</p><h1 style="font:40px/1.1 Georgia,serif">${e(content.subject)}</h1><p>${e(content.introduction)}</p>${content.articles.map((a, i) => `<article style="margin:24px 0;padding:24px;background:white;border-radius:12px"><small>0${i + 1} · ${e(a.category)}</small><h2 style="font:28px Georgia,serif">${e(a.title)}</h2><p>${e(date(a.date))} · ${e(a.time || "Horaire non renseigné")} (${e(zone.timezone)})<br>${e(a.place)}</p><p>${e(a.description)}</p><p>${e(a.price)}<br>Âge organisateur : ${e(a.organizerAge || "non renseigné")}<br>Réservation : ${a.booking === "yes" ? "nécessaire, disponibilité inconnue" : a.booking === "no" ? "non nécessaire selon la source" : "non renseignée"}</p><a href="${e(a.sourceUrl)}" style="color:#355b43">${e(a.sourceLabel)} →</a><p style="font-size:11px">Consultation de la source : ${e(a.checkedAt)}</p></article>`).join("")}${sponsor ? `<aside style="border:1px solid #ccbc9b;padding:22px;margin:32px 0;background:#f0eadb"><p style="font-size:11px;letter-spacing:1px"><b>PUBLICITÉ — PARTENAIRE LOCAL</b></p><p>${e(sponsor.name)}</p><h2 style="font:25px Georgia,serif">${e(sponsor.title)}</h2><p>${e(sponsor.body)}</p><a href="${e(sponsor.url)}" style="color:#355b43">Découvrir le partenaire →</a></aside>` : ""}<p style="font-size:12px">${footer}</p><p style="font-size:12px"><a href="${e(links.manage)}">Mon abonnement</a> · <a href="${e(links.unsubscribe)}">Me désinscrire</a></p></main></body></html>`;
  return { subject, html, text };
}
