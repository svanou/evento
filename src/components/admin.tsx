"use client";
import { useCallback, useEffect, useState } from "react";
import { type Edition, type Profile, type Selection } from "@/lib/domain";
type AdminData = {
  profiles: Profile[];
  editions: Edition[];
  jobs: {
    id: string;
    edition_id: string;
    status: string;
    attempt: number;
    error: string | null;
  }[];
  attempts: {
    id: string;
    job_id: string;
    attempt: number;
    state: string;
    error: string | null;
  }[];
  deliveries: { id: string; state: string; error: string | null }[];
};
export function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
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
  async function post(path: string, body: unknown) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="admin-login">
        <p className="eyebrow">ESPACE DE REVUE PROTÉGÉ</p>
        <h1>
          Un regard humain,
          <br />
          avant chaque édition.
        </h1>
        <form
          className="form-card fields"
          onSubmit={async (e) => {
            e.preventDefault();
            await post("login", { email, password });
          }}
        >
          <label>
            Email administrateur{" "}
            <small>(Supabase uniquement, facultatif en démo)</small>
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Connexion…" : "Ouvrir l’espace de revue →"}
          </button>
          <small>
            Le mot de passe de démonstration locale figure dans le README et
            .env.example. Ne pas exposer ce mode publiquement.
          </small>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  const edition =
    data.editions.find((e) => e.id === selected) || data.editions[0];
  const selection: Selection | null = edition?.data
    ? JSON.parse(edition.data)
    : null;
  const profile = data.profiles.find((p) => p.id === edition?.profile_id);
  return (
    <section className="admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ATELIER ÉDITORIAL · DÉMONSTRATION</p>
          <h1>La revue du vendredi.</h1>
          <p>
            Vérifier, retirer, approuver. L’envoi reste une étape distincte et
            désactivée.
          </p>
        </div>
        <button className="button secondary" onClick={() => post("logout", {})}>
          Se déconnecter
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="admin-stats">
        <div>
          <strong>{data.profiles.length}</strong>
          <span>profils de test</span>
        </div>
        <div>
          <strong>
            {data.editions.filter((e) => e.status === "ready").length}
          </strong>
          <span>éditions à relire</span>
        </div>
        <div>
          <strong>
            {data.jobs.filter((j) => j.status === "failed").length}
          </strong>
          <span>préparations en échec</span>
        </div>
        <div>
          <strong>Désactivé</strong>
          <span>envoi des emails</span>
        </div>
      </div>
      <div className="admin-columns">
        <aside className="admin-list">
          <div className="list-heading">
            <h2>Profils & éditions</h2>
            <button className="text-button" onClick={() => void load()}>
              Actualiser ↻
            </button>
          </div>
          {!data.profiles.length && (
            <p>Créez d’abord un profil fictif depuis l’onboarding.</p>
          )}
          {data.profiles.map((p) => (
            <div className="admin-profile" key={p.id}>
              <strong>{p.email}</strong>
              <small>
                {p.origin} · {p.confirmedAt ? "confirmé" : "à confirmer"}
                {p.unsubscribedAt ? " · désinscrit" : ""}
                {p.zone === "waiting" ? " · zone en attente" : ""}
              </small>
              <button
                disabled={busy || !!p.unsubscribedAt || p.zone === "waiting"}
                className="text-button"
                onClick={async () => {
                  if (await post("prepare", { profileId: p.id }))
                    setNotice(
                      "Préparation enregistrée. Le worker traite la file. Une édition existante est réutilisée pour éviter les doublons.",
                    );
                }}
              >
                Lancer une préparation →
              </button>
              {data.editions
                .filter((e) => e.profile_id === p.id)
                .map((e) => (
                  <button
                    className={`edition-option ${e.id === edition?.id ? "active" : ""}`}
                    key={e.id}
                    onClick={() => {
                      setSelected(e.id);
                      setExcluded([]);
                    }}
                  >
                    {e.weekend} · v{e.revision}
                    <span>{e.status}</span>
                  </button>
                ))}
            </div>
          ))}
        </aside>
        <div className="review-panel">
          {edition ? (
            <>
              <div className="review-heading">
                <div>
                  <p className="eyebrow">
                    {edition.status} · {edition.weekend}
                  </p>
                  <h2>
                    {profile?.origin} · édition v{edition.revision}
                  </h2>
                  <p>{profile?.email}</p>
                </div>
              </div>
              {edition.error && (
                <div className="notice error">{edition.error}</div>
              )}
              {selection ? (
                <>
                  <div className="metrics">
                    <span>{selection.metrics.calls} appels simulés</span>
                    <span>{selection.metrics.durationMs} ms</span>
                    <span>
                      Tokens : {selection.metrics.tokens ?? "inconnus"}
                    </span>
                    <span>
                      Coût mesuré :{" "}
                      {selection.metrics.measuredCost ?? "inconnu"}
                    </span>
                    <span>
                      Estimation :{" "}
                      {selection.metrics.estimatedCost ?? "inconnue"}
                    </span>
                  </div>
                  <p className="small-note">
                    Décochez une proposition retenue pour la retirer avant
                    approbation. Les alternatives et rejets ne peuvent pas être
                    promus sans nouvelle vérification.
                  </p>
                  {selection.items.map((item) => (
                    <details
                      className={`review-item review-${item.decision}`}
                      key={item.candidate.id}
                    >
                      <summary>
                        <span className={`decision ${item.decision}`}>
                          {item.decision === "selected"
                            ? "Retenue"
                            : item.decision === "alternative"
                              ? "À vérifier"
                              : "Rejetée"}
                        </span>
                        <strong>{item.candidate.title}</strong>
                      </summary>
                      {item.decision === "selected" && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={!excluded.includes(item.candidate.id)}
                            onChange={(e) =>
                              setExcluded((ids) =>
                                e.target.checked
                                  ? ids.filter((id) => id !== item.candidate.id)
                                  : [...ids, item.candidate.id],
                              )
                            }
                          />
                          Conserver dans la sélection approuvée
                        </label>
                      )}
                      <p>{item.relevance}</p>
                      {item.reasons.length > 0 && (
                        <ul>
                          {item.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      )}
                      <p>
                        Trajet :{" "}
                        {item.route
                          ? `${item.route.minutes ?? "?"} min · ${item.route.status} · ${item.route.provider}`
                          : "Non vérifié"}
                      </p>
                      {item.candidate.evidence.map((e) => (
                        <div className="evidence" key={e.url}>
                          <a href={e.url} target="_blank" rel="noreferrer">
                            {e.label} →
                          </a>
                          <p>{e.excerpt}</p>
                          <small>
                            {e.checkedAt} · année {e.year}
                          </small>
                        </div>
                      ))}
                    </details>
                  ))}
                  <div className="review-actions">
                    <button
                      className="button primary"
                      disabled={
                        busy || !["ready", "approved"].includes(edition.status)
                      }
                      onClick={async () => {
                        if (
                          await post("approve", {
                            editionId: edition.id,
                            keepIds: selection.items
                              .filter(
                                (i) =>
                                  i.decision === "selected" &&
                                  !excluded.includes(i.candidate.id),
                              )
                              .map((i) => i.candidate.id),
                          })
                        ) {
                          setExcluded([]);
                          setNotice("Sélection approuvée. Aucun email envoyé.");
                        }
                      }}
                    >
                      Approuver la sélection
                    </button>
                    <a
                      className="button secondary"
                      href={`/api/editions/${edition.id}/email`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Aperçu HTML →
                    </a>
                    <a
                      className="text-button"
                      href={`/api/editions/${edition.id}/email?format=text`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Texte →
                    </a>
                  </div>
                </>
              ) : (
                <p>
                  La préparation attend le worker. Actualisez pour consulter son
                  résultat.
                </p>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>Le carnet est encore vide.</h2>
              <p>Les premières sélections apparaîtront ici.</p>
            </div>
          )}
        </div>
      </div>
      <details className="alternatives">
        <summary>Historique technique des préparations et envois</summary>
        {data.jobs.map((job) => (
          <p key={job.id}>
            Préparation {job.edition_id.slice(0, 8)} · {job.status} ·{" "}
            {job.attempt} tentative(s){job.error ? ` · ${job.error}` : ""}
          </p>
        ))}
        {data.attempts.map((a) => (
          <p key={a.id}>
            Tentative {a.attempt} · {a.state}
            {a.error ? ` · ${a.error}` : ""}
          </p>
        ))}
        {data.deliveries.length ? (
          data.deliveries.map((d) => (
            <p key={d.id}>
              Envoi {d.state} · {d.error || "sans erreur"}
            </p>
          ))
        ) : (
          <p>Aucune tentative d’envoi. Fournisseur externe désactivé.</p>
        )}
      </details>
    </section>
  );
}
