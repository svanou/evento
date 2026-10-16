"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  type Subscriber,
  type Newsletter,
  type Content,
  type Zone,
} from "@/lib/domain";
export function Dashboard() {
  const [data, setData] = useState<{
    subscriber: Subscriber;
    zone: Zone;
    editions: Newsletter[];
    registrationOpen: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<"html" | "text" | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me");
      if (r.status === 401) {
        setData(null);
        return;
      }
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(path: string, method = "POST") {
    setError("");
    try {
      const res = await fetch(`/api/${path}`, { method });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (path === "confirmation")
        setMessage("Un email de confirmation vous a été envoyé.");
      if (method === "DELETE") {
        window.location.assign("/");
        return;
      }
      if (path === "unsubscribe")
        setMessage(
          "Vous êtes désinscrit. Aucun nouvel email ne vous sera envoyé.",
        );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    }
  }
  if (loading)
    return (
      <div className="empty-state" role="status">
        Ouverture de votre abonnement…
      </div>
    );
  if (!data)
    return (
      <div className="empty-state">
        <p className="eyebrow">UN EMAIL. VOTRE COIN. C’EST TOUT.</p>
        <h1>
          Les sorties du week-end,
          <br />
          dans votre boîte.
        </h1>
        <p>Inscrivez-vous gratuitement à votre newsletter locale.</p>
        <Link href="/inscription" className="button primary">
          M’inscrire →
        </Link>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const s = data.subscriber;
  const edition = data.editions[0];
  const content: Content | null = edition?.content
    ? JSON.parse(edition.content)
    : null;
  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MON ABONNEMENT · GRATUIT</p>
          <h1>
            {data.zone.name}
            <span className="orange">.</span>
          </h1>
          <p>
            {s.email} · {data.zone.timezone}
          </p>
        </div>
        <Link href={`/agenda-${s.zone}`} className="button secondary">
          La newsletter de ma zone →
        </Link>
      </div>
      <div className="dashboard-bar">
        <span>
          <span className="status-dot" />
          {s.unsubscribed_at
            ? "Désinscrit"
            : s.confirmed_at
              ? "Adresse confirmée"
              : "Adresse à confirmer"}
        </span>
        <span>Gratuit · financé par des partenaires locaux identifiés</span>
      </div>
      {!s.confirmed_at && !s.unsubscribed_at && (
        <div className="notice">
          <div>
            <strong>
              Confirmez votre adresse avant le premier rendez-vous.
            </strong>
            <p>Consultez votre email de confirmation.</p>
          </div>
          {data.registrationOpen && (
            <button
              className="button secondary"
              onClick={() => action("confirmation")}
            >
              Renvoyer la confirmation
            </button>
          )}
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
      {content ? (
        <>
          <div className="selection-heading">
            <div>
              <p className="eyebrow">
                ÉDITION DU WEEK-END DU{" "}
                {DateTime.fromISO(edition.weekend)
                  .setLocale("fr")
                  .toFormat("d LLLL yyyy")
                  .toUpperCase()}
              </p>
              <h2>{content.subject}</h2>
              <p>La même édition pour tous les lecteurs de {data.zone.name}.</p>
            </div>
            <button
              className="button secondary"
              onClick={() => setPreview(preview ? null : "html")}
            >
              {preview ? "Fermer l’aperçu" : "Voir la newsletter →"}
            </button>
          </div>
          <p>{content.introduction}</p>
          <div className="steps-grid">
            {content.articles.map((a, i) => (
              <article key={a.id}>
                <span className="step-index">
                  0{i + 1} · {a.category.toUpperCase()}
                </span>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
                <p>
                  {DateTime.fromISO(a.date)
                    .setLocale("fr")
                    .toFormat("cccc d LLLL")}{" "}
                  · {a.time || "Horaire non renseigné"}
                  <br />
                  {a.place} · {a.price}
                </p>
                <a
                  href={a.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-button"
                >
                  {a.sourceLabel} →
                </a>
              </article>
            ))}
          </div>
          {content.sponsor && (
            <aside className="sponsor-block">
              <p className="eyebrow">PUBLICITÉ — PARTENAIRE LOCAL</p>
              <strong>{content.sponsor.name}</strong>
              <h3>{content.sponsor.title}</h3>
              <p>{content.sponsor.body}</p>
              <a href={content.sponsor.url} target="_blank" rel="noreferrer">
                Découvrir le partenaire →
              </a>
            </aside>
          )}
          {preview && (
            <div className="email-preview">
              <div className="preview-toolbar">
                <strong>Aperçu · aucun envoi</strong>
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
                title="Prévisualisation de la newsletter"
                sandbox="allow-same-origin allow-top-navigation-by-user-activation"
                src={`/api/newsletters/${edition.id}/email?format=${preview}`}
              />
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <h2>Votre zone prépare son prochain rendez-vous.</h2>
          <p>
            Votre abonnement est enregistré. L’édition apparaîtra après sa
            préparation et sa validation éditoriale.
          </p>
          <button className="button secondary" onClick={() => void load()}>
            Actualiser
          </button>
        </div>
      )}
      <div className="account-panel">
        <div>
          <h3>Votre boîte mail, vos choix.</h3>
          <p>
            Nous conservons votre email et votre zone, sans profilage personnel.
          </p>
        </div>
        <div className="account-actions">
          {!s.unsubscribed_at && (
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
            Supprimer mes données
          </button>
        </div>
      </div>
      {deleting && (
        <div className="notice error">
          <p>
            Supprimer votre abonnement et ses données ? Les éditions communes
            resteront disponibles pour les autres lecteurs.
          </p>
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
