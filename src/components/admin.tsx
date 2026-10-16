"use client";
import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import {
  type Newsletter,
  type Zone,
  type Source,
  type Subscriber,
  type Content,
  type Edit,
  defaultSendAt,
} from "@/lib/domain";
type AdminData = {
  zones: Zone[];
  editions: Newsletter[];
  sources: Source[];
  subscribers: Subscriber[];
  jobs: {
    id: string;
    newsletter_id: string;
    status: string;
    attempt: number;
    error: string | null;
  }[];
  attempts: {
    id: string;
    attempt: number;
    state: string;
    error: string | null;
  }[];
  deliveries: { id: string; state: string; error: string | null }[];
  configuration: {
    email: {
      enabled: boolean;
      keyConfigured: boolean;
      senderConfigured: boolean;
    };
    automation: {
      running: boolean;
      cronConfigured: boolean;
      schedulingEnabled: boolean;
      pendingPreparations: number;
      pendingDispatches: number;
      last_finished_at?: number | null;
      last_error?: string | null;
      migrationRequired?: boolean;
    };
    research: { keyConfigured: boolean; modelConfigured: boolean };
  };
};
type Request = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<boolean>;
const statusLabels: Record<string, string> = {
  queued: "En attente",
  processing: "Préparation",
  ready: "À relire",
  approved: "Approuvée",
  failed: "Échec",
  scheduled: "Programmée",
  not_scheduled: "Non programmée",
  blocked: "Bloquée",
  sending: "En cours",
  sent: "Envoyée",
};
export function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<
    "newsletters" | "zones" | "sources" | "subscribers"
  >("newsletters");
  const [zoneId, setZoneId] = useState("pays-de-gex");
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(DateTime.local().toISODate()!);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/data");
      if (res.status === 401) {
        setData(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const pendingTasks =
    !!data &&
    (data.configuration.automation.running ||
      data.configuration.automation.pendingPreparations > 0 ||
      data.configuration.automation.pendingDispatches > 0);
  useEffect(() => {
    if (!pendingTasks) return;
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingTasks, load]);
  const request: Request = async (path, body = {}, method = "POST") => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNotice(
        path.includes("/send")
          ? "Diffusion mise en file. Les résultats apparaîtront dans les livraisons."
          : json.queued
            ? "Traitement demandé. Les tâches restantes restent enregistrées pour le prochain passage."
            : "Modification enregistrée.",
      );
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className="admin-login">
        <p className="eyebrow">ADMINISTRATION PROTÉGÉE</p>
        <h1>
          Votre média local,
          <br />
          côté coulisses.
        </h1>
        <form
          className="form-card fields"
          onSubmit={(e) => {
            e.preventDefault();
            void request("login", { email, password });
          }}
        >
          <label>
            Email administrateur
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Ouvrir l’administration →
          </button>
          <small>
            Connexion Supabase Auth. Un accès local distinct peut être configuré
            pour le développement.
          </small>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  const zone = data.zones.find((z) => z.id === zoneId) || data.zones[0];
  const editions = data.editions.filter((e) => e.zone === zone?.id);
  const edition = editions.find((e) => e.id === selected) || editions[0];
  const mailReady = Object.values(data.configuration.email).every(Boolean);
  return (
    <section className="admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVENTO · ADMINISTRATION</p>
          <h1>Les rendez-vous locaux.</h1>
          <p>Une édition par zone. Préparer, relire, programmer.</p>
        </div>
        <button className="button secondary" onClick={() => request("logout")}>
          Se déconnecter
        </button>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Administration">
        {(
          [
            ["newsletters", "Newsletters"],
            ["zones", "Zones"],
            ["sources", "Sources"],
            ["subscribers", "Abonnés"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="zone-toolbar">
        <label>
          Zone
          <select
            aria-label="Zone de travail"
            value={zone?.id || ""}
            onChange={(e) => {
              setZoneId(e.target.value);
              setSelected("");
            }}
          >
            {data.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
                {z.status === "draft" ? " · brouillon" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="text-button" onClick={() => void load()}>
          Actualiser
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="notice">
        <strong>Traitements automatiques</strong>
        {data.configuration.automation.migrationRequired ? (
          <p>
            Appliquer la migration Supabase 003_vercel_tasks.sql pour activer
            les traitements.
          </p>
        ) : (
          <>
            <p>
              {data.configuration.automation.running
                ? "Traitement en cours."
                : "Aucun traitement en cours."}{" "}
              {data.configuration.automation.pendingPreparations} préparation(s)
              et {data.configuration.automation.pendingDispatches} diffusion(s)
              en attente.
            </p>
            <p>
              Sur Hobby : un passage quotidien entre 8 h et 9 h UTC. Une
              exécution traite au plus une préparation et 50 emails ; les tâches
              restantes attendent le prochain passage ou un lancement manuel.
            </p>
            {!data.configuration.automation.cronConfigured && (
              <p>
                Configurer CRON_SECRET dans Vercel (au moins 32 caractères) pour
                activer le passage automatique.
              </p>
            )}
            <p>
              {data.configuration.automation.schedulingEnabled
                ? "Création automatique des brouillons activée."
                : "Création automatique des brouillons désactivée ; le bouton Préparer reste disponible."}
            </p>
            {data.configuration.automation.last_finished_at && (
              <p>
                Dernier passage :{" "}
                {DateTime.fromMillis(
                  Number(data.configuration.automation.last_finished_at),
                )
                  .setZone("Europe/Paris")
                  .toFormat("dd/LL/yyyy HH:mm")}{" "}
                (Paris).
              </p>
            )}
            {data.configuration.automation.last_error && (
              <p role="alert">{data.configuration.automation.last_error}</p>
            )}
            <button
              className="button secondary"
              disabled={busy || data.configuration.automation.running}
              onClick={() => request("tasks/run")}
            >
              Traiter les tâches en attente
            </button>
          </>
        )}
      </div>
      {(!mailReady ||
        !Object.values(data.configuration.research).every(Boolean)) && (
        <div className="notice">
          <p>
            <strong>Services à configurer</strong>
            <br />
            Recherche :{" "}
            {Object.values(data.configuration.research).every(Boolean)
              ? "clé et modèle renseignés, connexion à valider"
              : "OPENAI_API_KEY et OPENAI_MODEL requis dans les variables Vercel"}
            .<br />
            Emails :{" "}
            {mailReady
              ? "configuration renseignée, domaine et connexion à valider"
              : "désactivés ou incomplets — EMAIL_MODE, RESEND_API_KEY et EMAIL_FROM"}
            . Les contenus ne sont jamais remplacés par des exemples.
          </p>
        </div>
      )}
      {tab === "newsletters" && zone && (
        <>
          <div className="zone-toolbar">
            <div>
              <h2>Newsletters · {zone.name}</h2>
              <p className="small-note">
                {
                  ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"][
                    zone.send_day
                  ]
                }{" "}
                à {zone.send_hour} h · {zone.timezone}
              </p>
            </div>
            <form
              className="prepare-form"
              onSubmit={(e) => {
                e.preventDefault();
                void request("prepare", {
                  zone: zone.id,
                  date: DateTime.fromISO(date, { zone: zone.timezone }).toISO(),
                });
              }}
            >
              <label>
                Date dans la semaine à préparer
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <button
                className="button primary"
                disabled={busy || zone.status !== "active"}
              >
                Préparer l’édition
              </button>
            </form>
          </div>
          <div className="admin-columns">
            <aside className="admin-list">
              {!editions.length && (
                <p>
                  Aucune édition. La première préparation lancera la recherche
                  sur les sources actives de cette zone.
                </p>
              )}
              {editions.map((e) => (
                <button
                  className={`edition-option ${edition?.id === e.id ? "active" : ""}`}
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                >
                  {e.weekend}
                  <span>{statusLabels[e.preparation_status]}</span>
                  <small>Diffusion : {statusLabels[e.send_status]}</small>
                </button>
              ))}
            </aside>
            <div className="review-panel">
              {edition ? (
                <>
                  <p className="eyebrow">
                    PRÉPARATION : {statusLabels[edition.preparation_status]} ·
                    DIFFUSION : {statusLabels[edition.send_status]}
                  </p>
                  {edition.error && (
                    <p className="notice error">{edition.error}</p>
                  )}
                  {((edition.preparation_status === "failed" &&
                    !edition.content) ||
                    (edition.preparation_status === "ready" &&
                      edition.content &&
                      !(JSON.parse(edition.content) as Content).articles
                        .length)) && (
                    <button
                      className="button secondary"
                      onClick={() => request(`newsletters/${edition.id}/retry`)}
                    >
                      Relancer après correction
                    </button>
                  )}
                  {edition.content ? (
                    <EditionEditor
                      key={`${edition.id}-${edition.revision}-${edition.send_status}-${edition.preparation_status}`}
                      edition={edition}
                      zone={zone}
                      request={request}
                      busy={busy}
                      mailReady={mailReady}
                    />
                  ) : (
                    <div className="empty-state">
                      <h2>En attente de contenu réel.</h2>
                      <p>
                        Le traitement prépare le brouillon à partir des sources
                        actives. Le résultat ou le motif d’échec apparaîtra
                        automatiquement.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <h2>La première édition commence ici.</h2>
                  <p>Ajoutez vos sources, puis lancez une préparation.</p>
                </div>
              )}
            </div>
          </div>
          <details className="alternatives">
            <summary>Tentatives et erreurs</summary>
            {data.jobs
              .filter((j) => editions.some((e) => e.id === j.newsletter_id))
              .map((j) => (
                <p key={j.id}>
                  {j.status} · {j.attempt} tentative(s) ·{" "}
                  {j.error || "Aucune erreur"}
                </p>
              ))}
            {data.deliveries.map((d) => (
              <p key={d.id}>
                Envoi : {d.state} · {d.error || "Aucune erreur"}
              </p>
            ))}
          </details>
        </>
      )}
      {tab === "zones" && (
        <ZonesPanel
          key={zone?.id}
          zones={data.zones}
          request={request}
          busy={busy}
        />
      )}
      {tab === "sources" && zone && (
        <SourcesPanel
          key={zone.id}
          zone={zone}
          sources={data.sources.filter((s) => s.zone === zone.id)}
          request={request}
          busy={busy}
        />
      )}
      {tab === "subscribers" && (
        <div className="review-panel">
          <h2>Abonnés · {zone?.name}</h2>
          <p className="small-note">
            Seules les adresses confirmées et non désinscrites sont éligibles à
            la diffusion.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Statut</th>
                  <th>Inscription</th>
                </tr>
              </thead>
              <tbody>
                {data.subscribers
                  .filter((s) => s.zone === zone?.id)
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.email}</td>
                      <td>
                        {s.unsubscribed_at
                          ? "Désinscrit"
                          : s.confirmed_at
                            ? "Confirmé"
                            : "À confirmer"}
                      </td>
                      <td>
                        {DateTime.fromMillis(Number(s.created_at)).toFormat(
                          "dd/LL/yyyy",
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
function EditionEditor({
  edition,
  zone,
  request,
  busy,
  mailReady,
}: {
  edition: Newsletter;
  zone: Zone;
  request: Request;
  busy: boolean;
  mailReady: boolean;
}) {
  const content: Content = JSON.parse(edition.content!);
  const [edit, setEdit] = useState<Edit>({
    revision: edition.revision,
    subject: content.subject,
    introduction: content.introduction,
    articles: content.articles.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    })),
    sponsor: content.sponsor,
  });
  const [dirty, setDirty] = useState(false);
  const [format, setFormat] = useState<"html" | "text">("html");
  const [showPreview, setShowPreview] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const defaultAt = defaultSendAt(
    {
      key: edition.weekend,
      saturday: edition.weekend,
      sunday: "",
      timezone: zone.timezone,
    },
    zone,
  );
  const [at, setAt] = useState(
    DateTime.fromISO(defaultAt)
      .setZone(zone.timezone)
      .toFormat("yyyy-LL-dd'T'HH:mm"),
  );
  function change(next: Edit) {
    setEdit(next);
    setDirty(true);
  }
  const frozen = ["sending", "sent"].includes(edition.send_status);
  const contentFrozen = frozen || edition.dispatch_started_at != null;
  return (
    <>
      <div className="metrics">
        <span>Version {edition.revision}</span>
        <span>{content.metrics.calls} appel(s) API</span>
        <span>{content.metrics.durationMs} ms</span>
        <span>Tokens : {content.metrics.tokens ?? "inconnus"}</span>
        <span>Coût mesuré : {content.metrics.measuredCost ?? "inconnu"}</span>
      </div>
      <form
        className="fields"
        onSubmit={(e) => {
          e.preventDefault();
          void request(`newsletters/${edition.id}/edit`, edit);
        }}
      >
        <label>
          Objet de l’email
          <input
            required
            maxLength={160}
            value={edit.subject}
            onChange={(e) => change({ ...edit, subject: e.target.value })}
            disabled={contentFrozen}
          />
        </label>
        <label>
          Introduction
          <textarea
            required
            rows={4}
            maxLength={2000}
            value={edit.introduction}
            onChange={(e) => change({ ...edit, introduction: e.target.value })}
            disabled={contentFrozen}
          />
        </label>
        <fieldset disabled={contentFrozen}>
          <legend>Sorties retenues · maximum 5</legend>
          {edit.articles.map((a, index) => {
            const facts = content.reviews.find(
              (r) => r.candidate.id === a.id,
            )!.candidate;
            return (
              <div className="article-editor fields" key={a.id}>
                <div className="zone-toolbar">
                  <strong>
                    0{index + 1} · {facts.date} ·{" "}
                    {facts.time || "Horaire non renseigné"}
                  </strong>
                  <div className="row-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => {
                        const articles = [...edit.articles];
                        [articles[index - 1], articles[index]] = [
                          articles[index],
                          articles[index - 1],
                        ];
                        change({ ...edit, articles });
                      }}
                    >
                      ↑ Monter
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        change({
                          ...edit,
                          articles: edit.articles.filter((i) => i.id !== a.id),
                        })
                      }
                    >
                      Retirer
                    </button>
                  </div>
                </div>
                <label>
                  Titre de la sortie
                  <input
                    required
                    value={a.title}
                    maxLength={180}
                    onChange={(e) =>
                      change({
                        ...edit,
                        articles: edit.articles.map((i) =>
                          i.id === a.id ? { ...i, title: e.target.value } : i,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Texte de la sortie
                  <textarea
                    required
                    rows={3}
                    maxLength={1600}
                    value={a.description}
                    onChange={(e) =>
                      change({
                        ...edit,
                        articles: edit.articles.map((i) =>
                          i.id === a.id
                            ? { ...i, description: e.target.value }
                            : i,
                        ),
                      })
                    }
                  />
                </label>
                <details>
                  <summary>Faits & source</summary>
                  <p>
                    {facts.place} · {facts.price}
                    <br />
                    Âge organisateur : {facts.organizerAge || "Non renseigné"} ·
                    Réservation : {facts.booking}
                  </p>
                  <a href={facts.sourceUrl} target="_blank" rel="noreferrer">
                    {facts.sourceLabel} →
                  </a>
                  <blockquote>{facts.sourceExcerpt}</blockquote>
                  <small>Vérification : {facts.checkedAt}</small>
                </details>
              </div>
            );
          })}
        </fieldset>
        <details className="alternatives">
          <summary>Candidats écartés et informations à vérifier</summary>
          {content.reviews.map((r) => (
            <div className="alternative-row" key={r.candidate.id}>
              <strong>{r.candidate.title}</strong>
              <span>
                {r.decision === "included"
                  ? "Retenue par la préparation"
                  : r.reasons.join(" · ")}
              </span>
              <a href={r.candidate.sourceUrl} target="_blank" rel="noreferrer">
                Consulter la source
              </a>
              {r.decision === "included" &&
                !edit.articles.some((a) => a.id === r.candidate.id) && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={contentFrozen}
                    onClick={() =>
                      change({
                        ...edit,
                        articles: [
                          ...edit.articles,
                          {
                            id: r.candidate.id,
                            title: r.candidate.title,
                            description: r.candidate.description,
                          },
                        ],
                      })
                    }
                  >
                    Réintégrer
                  </button>
                )}
            </div>
          ))}
        </details>
        <fieldset disabled={contentFrozen} className="sponsor-block">
          <legend>Publicité — partenaire local</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!edit.sponsor}
              onChange={(e) =>
                change({
                  ...edit,
                  sponsor: e.target.checked
                    ? { name: "", title: "", body: "", url: "" }
                    : null,
                })
              }
            />
            Ajouter un encart sponsorisé, séparé de la sélection
          </label>
          {edit.sponsor && (
            <div className="fields">
              <label>
                Nom du partenaire
                <input
                  required
                  value={edit.sponsor.name}
                  maxLength={120}
                  onChange={(e) =>
                    change({
                      ...edit,
                      sponsor: { ...edit.sponsor!, name: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Titre de l’encart
                <input
                  required
                  value={edit.sponsor.title}
                  maxLength={160}
                  onChange={(e) =>
                    change({
                      ...edit,
                      sponsor: { ...edit.sponsor!, title: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Texte de l’encart
                <textarea
                  required
                  value={edit.sponsor.body}
                  maxLength={700}
                  rows={3}
                  onChange={(e) =>
                    change({
                      ...edit,
                      sponsor: { ...edit.sponsor!, body: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Lien du partenaire
                <input
                  type="url"
                  required
                  value={edit.sponsor.url}
                  onChange={(e) =>
                    change({
                      ...edit,
                      sponsor: { ...edit.sponsor!, url: e.target.value },
                    })
                  }
                  placeholder="https://"
                />
              </label>
            </div>
          )}
        </fieldset>
        <button
          className="button primary"
          disabled={busy || !dirty || contentFrozen}
        >
          Enregistrer les modifications
        </button>
        <small>
          Chaque modification retire l’approbation et annule la programmation.
          Les dates, tarifs et preuves restent ceux de la préparation ; retirer
          une sortie dont les faits sont incorrects.
        </small>
      </form>
      <div className="review-actions">
        <button
          className="button secondary"
          disabled={busy || dirty || contentFrozen || !edit.articles.length}
          onClick={() =>
            request(`newsletters/${edition.id}/approve`, {
              revision: edition.revision,
            })
          }
        >
          Approuver cette version
        </button>
        <button
          className="text-button"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? "Fermer l’aperçu" : "Prévisualiser l’email"}
        </button>
      </div>
      {dirty && (
        <p className="small-note">
          L’aperçu correspond à la dernière version enregistrée.
        </p>
      )}
      {showPreview && (
        <div className="email-preview">
          <div className="preview-toolbar">
            <strong>Aperçu enregistré · aucun envoi</strong>
            <div>
              <button type="button" onClick={() => setFormat("html")}>
                HTML
              </button>
              <button type="button" onClick={() => setFormat("text")}>
                Texte
              </button>
            </div>
          </div>
          <iframe
            title="Aperçu newsletter"
            sandbox="allow-same-origin"
            src={`/api/newsletters/${edition.id}/email?format=${format}`}
          />
        </div>
      )}
      <div className="schedule-box fields">
        <h3>Diffusion</h3>
        <p className="small-note">
          Horaire dans le fuseau {zone.timezone}. L’envoi ne partira que si le
          fournisseur est configuré et activé. L’heure choisie est une échéance
          au plus tôt : la diffusion commence au prochain passage quotidien, ou
          après un lancement manuel des tâches.
        </p>
        {edition.scheduled_at && (
          <p>
            Programmée le{" "}
            {DateTime.fromMillis(Number(edition.scheduled_at))
              .setZone(zone.timezone)
              .toFormat("dd/LL/yyyy HH:mm")}
            .
          </p>
        )}
        <label>
          Date et heure d’envoi
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <div className="review-actions">
          <button
            className="button secondary"
            disabled={
              busy ||
              dirty ||
              edition.preparation_status !== "approved" ||
              frozen
            }
            onClick={() =>
              request(`newsletters/${edition.id}/schedule`, {
                revision: edition.revision,
                at: DateTime.fromISO(at, { zone: zone.timezone }).toISO(),
              })
            }
          >
            Programmer
          </button>
          {["scheduled", "blocked"].includes(edition.send_status) && (
            <button
              className="text-button"
              onClick={() => request(`newsletters/${edition.id}/cancel`)}
            >
              Annuler la programmation
            </button>
          )}
          <button
            className="text-button"
            disabled={
              !mailReady ||
              busy ||
              dirty ||
              edition.preparation_status !== "approved" ||
              frozen
            }
            onClick={() => setConfirmSend(true)}
          >
            Envoyer maintenant
          </button>
        </div>
        {confirmSend && (
          <div className="notice">
            <p>
              Envoyer réellement cette version aux abonnés confirmés de{" "}
              {zone.name} ?
            </p>
            <button
              className="button secondary"
              onClick={() => setConfirmSend(false)}
            >
              Annuler
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                await request(`newsletters/${edition.id}/send`);
                setConfirmSend(false);
              }}
            >
              Confirmer l’envoi réel
            </button>
          </div>
        )}
      </div>
    </>
  );
}
function ZonesPanel({
  zones,
  request,
  busy,
}: {
  zones: Zone[];
  request: Request;
  busy: boolean;
}) {
  const empty: Zone = {
    id: "",
    name: "",
    country: "FR",
    timezone: "Europe/Paris",
    currency: "EUR",
    language: "fr",
    status: "draft",
    send_day: 4,
    send_hour: 8,
  };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Zone>(empty);
  return (
    <div className="admin-columns">
      <aside className="admin-list">
        <h2>Zones</h2>
        <button
          className="button secondary"
          onClick={() => {
            setForm(empty);
            setEditing(false);
          }}
        >
          Ajouter une zone
        </button>
        {zones.map((z) => (
          <button
            className="edition-option"
            key={z.id}
            onClick={() => {
              setForm(z);
              setEditing(true);
            }}
          >
            {z.name}
            <span>{z.status === "active" ? "Ouverte" : "Brouillon"}</span>
          </button>
        ))}
      </aside>
      <form
        className="review-panel fields"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await request("zones", form, editing ? "PATCH" : "POST"))
            setEditing(true);
        }}
      >
        <h2>{editing ? "Modifier la zone" : "Nouvelle zone"}</h2>
        <label>
          Nom de la zone
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Identifiant de page
          <input
            required
            disabled={editing}
            pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
            placeholder="geneve"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
          <small>
            Page : /agenda-{form.id || "identifiant"}. Identifiant stable après
            création.
          </small>
        </label>
        <div className="field-pair">
          <label>
            Pays (code ISO)
            <input
              required
              value={form.country}
              pattern="[A-Z]{2}"
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </label>
          <label>
            Devise
            <input
              required
              pattern="[A-Z]{3}"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
        </div>
        <label>
          Fuseau horaire
          <input
            required
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </label>
        <div className="field-pair">
          <label>
            Jour d’envoi
            <select
              value={form.send_day}
              onChange={(e) =>
                setForm({ ...form, send_day: Number(e.target.value) })
              }
            >
              {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"].map(
                (d, i) => (
                  <option value={i + 1} key={d}>
                    {d}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Heure locale
            <input
              type="number"
              min={0}
              max={23}
              required
              value={form.send_hour}
              onChange={(e) =>
                setForm({ ...form, send_hour: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {editing && (
          <label>
            Statut
            <select
              aria-label="Statut"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Zone["status"] })
              }
            >
              <option value="draft">
                Brouillon · page et inscription fermées
              </option>
              <option value="active">Ouverte · source active requise</option>
            </select>
          </label>
        )}
        <p className="small-note">
          Toute nouvelle zone commence en brouillon. Ajoutez ses sources dans
          l’onglet Sources avant de l’ouvrir. Les éditions restent en français
          pour le moment.
        </p>
        <button className="button primary" disabled={busy}>
          {editing ? "Enregistrer la zone" : "Créer la zone en brouillon"}
        </button>
        {editing && form.status === "active" && (
          <a href={`/agenda-${form.id}`} target="_blank" rel="noreferrer">
            Voir la page publique →
          </a>
        )}
      </form>
    </div>
  );
}
function SourcesPanel({
  zone,
  sources,
  request,
  busy,
}: {
  zone: Zone;
  sources: Source[];
  request: Request;
  busy: boolean;
}) {
  const empty = { name: "", url: "", notes: "", enabled: true };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<string | null>(null);
  return (
    <div className="admin-columns">
      <aside className="admin-list">
        <h2>Sources · {zone.name}</h2>
        <button
          className="button secondary"
          onClick={() => {
            setId(null);
            setForm(empty);
          }}
        >
          Ajouter une source
        </button>
        {sources.map((s) => (
          <button
            className="edition-option"
            key={s.id}
            onClick={() => {
              setId(s.id);
              setForm({
                name: s.name,
                url: s.url,
                notes: s.notes,
                enabled: !!s.enabled,
              });
            }}
          >
            {s.name}
            <small>{s.enabled ? "Active" : "Inactive"}</small>
          </button>
        ))}
      </aside>
      <form
        className="review-panel fields"
        onSubmit={(e) => {
          e.preventDefault();
          void request(
            "sources",
            { zone: zone.id, ...(id ? { id } : {}), source: form },
            id ? "PATCH" : "POST",
          );
        }}
      >
        <h2>{id ? "Modifier la source" : "Nouvelle source"}</h2>
        <label>
          Nom
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Adresse de l’agenda
          <input
            type="url"
            required
            placeholder="https://"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </label>
        <label>
          Notes de suivi
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Inclure ce domaine dans les recherches de la zone
        </label>
        <p className="small-note">
          Agenda touristique, mairie, lieu culturel ou association. L’activation
          autorise la recherche sur ce domaine ; elle ne certifie pas son
          contenu ni une couverture exhaustive.
        </p>
        <button className="button primary" disabled={busy}>
          Enregistrer la source
        </button>
      </form>
    </div>
  );
}
