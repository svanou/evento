"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  type Assessed,
  type Edition,
  type Profile,
  type Selection,
  money,
  modeLabels,
} from "@/lib/domain";
import { Landscape } from "./shell";
import { Onboarding } from "./onboarding";

export function CandidateCard({
  item,
  editionId,
}: {
  item: Assessed;
  editionId?: string;
}) {
  const [feedback, setFeedback] = useState("");
  const c = item.candidate;
  async function respond(kind: string) {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, candidateId: c.id, kind }),
      });
      const data = await res.json();
      setFeedback(res.ok ? data.suggestion : data.error);
    } catch {
      setFeedback("Connexion interrompue. Réessayez.");
    }
  }
  return (
    <article className="event-card">
      <div className={`event-art event-art-${c.interests[0]}`}>
        <Landscape variant={c.interests[0]} />
        <span className="fiction-label">SORTIE FICTIVE</span>
        <span className="event-price">{money(c.price, item.totalPrice)}</span>
      </div>
      <div className="event-body">
        <span className="eyebrow">
          {DateTime.fromISO(c.start)
            .setZone(c.timezone)
            .setLocale("fr")
            .toFormat("cccc d LLLL · HH:mm")}
        </span>
        <h3>{c.title}</h3>
        <p className="event-place">⌁ {c.place}</p>
        <p>{c.description}</p>
        <div className="relevance">✳︎ {item.relevance}</div>
        <dl className="event-facts">
          <div>
            <dt>Trajet</dt>
            <dd>
              {item.route?.minutes != null
                ? `${item.route.minutes} min ${modeLabels[item.route.mode]} — ${item.route.status === "simulated" ? "fictif" : "vérifié"}`
                : "Non vérifié"}
            </dd>
          </div>
          <div>
            <dt>Âge organisateur</dt>
            <dd>
              {c.organizerAge
                ? `Dès ${c.organizerAge.min} ans${c.organizerAge.max !== null ? `, jusqu’à ${c.organizerAge.max} ans` : ""}`
                : "Non précisé"}
            </dd>
          </div>
          <div>
            <dt>Réservation</dt>
            <dd>
              {c.booking === null
                ? "Non renseignée"
                : c.booking
                  ? "Nécessaire · disponibilité inconnue"
                  : "Non nécessaire selon la fiche fictive"}
            </dd>
          </div>
        </dl>
        <p className="small-note">
          {item.constraintStatus === "simulated"
            ? "Compatibilité simulée. Les contraintes réelles de trajet, d’accès et de budget ne sont pas vérifiées."
            : item.constraintStatus === "unverified"
              ? "Contraintes non vérifiées."
              : "Contraintes vérifiées."}
          {item.route?.mode === "bike"
            ? " Itinéraire adapté aux enfants : non vérifié."
            : ""}
        </p>
        <details>
          <summary>Sources & dernière vérification</summary>
          {c.evidence.map((e) => (
            <div className="evidence" key={e.url}>
              <a href={e.url} target="_blank" rel="noreferrer">
                {e.label} →
              </a>
              <p>{e.excerpt}</p>
              <small>
                Vérification {e.fictitious ? "simulée" : ""} le{" "}
                {DateTime.fromISO(e.checkedAt)
                  .setLocale("fr")
                  .toFormat("dd LLL yyyy HH:mm")}
                . Fuseau de l’événement : {c.timezone}.
              </small>
            </div>
          ))}
        </details>
        {editionId && (
          <div className="feedback">
            <span>Cette idée vous parle ?</span>
            <div>
              {[
                ["interested", "Ça m’intéresse"],
                ["not-for-me", "Pas pour moi"],
                ["too-far", "Trop loin"],
                ["known", "Déjà connu"],
              ].map(([kind, text]) => (
                <button
                  className="feedback-button"
                  key={kind}
                  onClick={() => respond(kind)}
                >
                  {text}
                </button>
              ))}
            </div>
            {feedback && (
              <p role="status">
                {feedback} <Link href="/preferences">Mes préférences</Link>
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
export function Dashboard({ editing = false }: { editing?: boolean }) {
  const [data, setData] = useState<{
    profile: Profile;
    editions: Edition[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<"html" | "text" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        setData(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion interrompue");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const edition = data?.editions.find(
    (e) => e.revision === data.profile.revision,
  );
  useEffect(() => {
    if (!edition || !["queued", "processing"].includes(edition.status)) return;
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [edition, load]);
  async function action(path: string, method = "POST") {
    try {
      setError("");
      const res = await fetch(`/api/${path}`, { method });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.confirmationLink) setLink(json.confirmationLink);
      if (method === "DELETE") {
        window.location.assign("/");
        return;
      }
      if (path === "unsubscribe")
        setMessage(
          "Vous êtes désinscrit. Aucune nouvelle édition ne sera préparée ni envoyée.",
        );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    }
  }
  if (loading)
    return (
      <div className="empty-state" role="status">
        On ouvre votre carnet de week-end…
      </div>
    );
  if (!data)
    return (
      <div className="empty-state">
        <p className="eyebrow">TOUT COMMENCE PAR VOS ENVIES</p>
        <h1>
          Votre prochain week-end
          <br />
          vous attend.
        </h1>
        <p>Créez un profil fictif pour découvrir votre première sélection.</p>
        <Link className="button primary" href="/inscription">
          Créer mon profil →
        </Link>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (editing) {
    const {
      email,
      origin,
      country,
      timezone,
      language,
      group,
      adults,
      childrenAges,
      interests,
      availability,
      budget,
      currency,
      preferFree,
      transport,
      crossBorder,
      stroller,
      accessible,
      setting,
      consent,
    } = data.profile;
    return (
      <Onboarding
        initial={{
          email,
          origin,
          country,
          timezone,
          language,
          group,
          adults,
          childrenAges,
          interests,
          availability,
          budget,
          currency,
          preferFree,
          transport,
          crossBorder,
          stroller,
          accessible,
          setting,
          consent,
        }}
      />
    );
  }
  const p = data.profile;
  const selection: Selection | null = edition?.data
    ? JSON.parse(edition.data)
    : null;
  const selected =
    selection?.items.filter((i) => i.decision === "selected") || [];
  const alternatives =
    selection?.items.filter((i) => i.decision === "alternative") || [];
  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">VOTRE CARNET DE SORTIES</p>
          <h1>
            Bonjour, le week-end<span className="orange">.</span>
          </h1>
          <p>
            {p.origin} ·{" "}
            {p.group === "family"
              ? "En famille"
              : p.group === "solo"
                ? "En solo"
                : p.group === "couple"
                  ? "À deux"
                  : "Entre amis"}{" "}
            · {p.timezone}
          </p>
        </div>
        <Link href="/preferences" className="button secondary">
          Ajuster mes préférences →
        </Link>
      </div>
      <div className="dashboard-bar">
        <span>
          <span className="status-dot" />{" "}
          {p.unsubscribedAt
            ? "Désinscrit"
            : p.confirmedAt
              ? "Adresse confirmée en démonstration"
              : "Adresse à confirmer"}
        </span>
        <span>
          {4 - p.trialUsed} éditions d’essai restantes · aucun paiement actif
        </span>
      </div>
      {!p.confirmedAt && !p.unsubscribedAt && (
        <div className="notice">
          <div>
            <strong>Un petit clic avant nos prochains rendez-vous.</strong>
            <p>
              Confirmez votre adresse pour autoriser les éditions récurrentes.
              Dans la démo, le lien apparaît ici, sans envoi d’email.
            </p>
            {link && (
              <Link className="inline-link" href={link}>
                Ouvrir le lien de confirmation de démonstration →
              </Link>
            )}
          </div>
          <button
            className="button secondary"
            onClick={() => action("confirmation")}
          >
            Obtenir le lien de confirmation
          </button>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {p.zone === "waiting" ? (
        <div className="empty-state">
          <h2>Un peu de patience pour votre point de départ.</h2>
          <p>
            Cette zone n’est pas encore reconnue ou suffisamment couverte. Votre
            profil est enregistré en attente ; aucune couverture réelle n’est
            promise.
          </p>
          <Link href="/preferences" className="button secondary">
            Modifier mon point de départ
          </Link>
        </div>
      ) : (
        <>
          {(!edition || ["queued", "processing"].includes(edition.status)) &&
            !p.unsubscribedAt && (
              <div className="empty-state processing">
                <span className="loading-flower">✳︎</span>
                <h2>Votre sélection prend forme.</h2>
                <p>
                  La préparation est enregistrée et continue grâce au worker,
                  même si vous fermez cette page.
                </p>
                <small>
                  Si elle reste en attente, lancez <code>npm run worker</code>{" "}
                  dans le terminal du projet.
                </small>
              </div>
            )}
          {edition?.status === "failed" && (
            <div className="notice error">
              <strong>La préparation n’a pas abouti.</strong>
              <p>
                {edition.error}. Les tentatives sont conservées dans l’espace de
                revue.
              </p>
            </div>
          )}
          {selection && (
            <>
              <div className="selection-heading">
                <div>
                  <p className="eyebrow">
                    ÉDITION DU{" "}
                    {DateTime.fromISO(selection.weekend.saturday)
                      .setLocale("fr")
                      .toFormat("d LLLL yyyy")
                      .toUpperCase()}
                  </p>
                  <h2>
                    {selected.length
                      ? `${selected.length} bonnes raisons de sortir.`
                      : "Pas de proposition conforme pour le moment."}
                  </h2>
                  <p>
                    Des idées fictives pour tester vos envies, sans compromis
                    sur vos contraintes.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setPreview(preview ? null : "html")}
                >
                  {preview ? "Fermer l’aperçu" : "Prévisualiser mon email →"}
                </button>
              </div>
              {preview && (
                <div className="email-preview">
                  <div className="preview-toolbar">
                    <strong>Aperçu local · aucun envoi</strong>
                    <div>
                      <button
                        aria-pressed={preview === "html"}
                        onClick={() => setPreview("html")}
                      >
                        HTML
                      </button>
                      <button
                        aria-pressed={preview === "text"}
                        onClick={() => setPreview("text")}
                      >
                        Texte
                      </button>
                    </div>
                  </div>
                  <iframe
                    title="Prévisualisation de votre email"
                    sandbox="allow-same-origin allow-top-navigation-by-user-activation"
                    src={`/api/editions/${edition!.id}/email?format=${preview}`}
                  />
                </div>
              )}
              <div className="event-grid">
                {selected.map((item) => (
                  <CandidateCard
                    key={item.candidate.id}
                    item={item}
                    editionId={edition!.id}
                  />
                ))}
              </div>
              {alternatives.length > 0 && (
                <details className="alternatives">
                  <summary>
                    {alternatives.length} alternative(s) à vérifier — hors
                    sélection principale
                  </summary>
                  <p>
                    Ces sorties ne sont pas présentées comme conformes à vos
                    contraintes.
                  </p>
                  {alternatives.map((item) => (
                    <div className="alternative-row" key={item.candidate.id}>
                      <strong>{item.candidate.title}</strong>
                      <span>{item.reasons.join(" · ")}</span>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
      <div className="account-panel">
        <div>
          <h3>Vos préférences vous appartiennent.</h3>
          <p>Aucune déduction personnelle cachée. Vous gardez la main.</p>
        </div>
        <div className="account-actions">
          {!p.unsubscribedAt && (
            <button
              className="text-button"
              onClick={() => action("unsubscribe")}
            >
              Me désinscrire
            </button>
          )}
          <button
            className="text-button danger"
            onClick={() => setDeleting(true)}
          >
            Supprimer mon profil
          </button>
        </div>
      </div>
      {deleting && (
        <div className="notice error" role="alert">
          <div>
            <strong>Supprimer définitivement ce profil et ses données ?</strong>
            <p>
              Les sélections, liens de gestion et retours seront également
              supprimés.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setDeleting(false)}
          >
            Annuler
          </button>
          <button
            className="button danger-button"
            onClick={() => action("me", "DELETE")}
          >
            Confirmer la suppression
          </button>
        </div>
      )}
    </section>
  );
}
