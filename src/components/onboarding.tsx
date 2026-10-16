"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  interests,
  modes,
  modeLabels,
  slots,
  type Preferences,
} from "@/lib/domain";

export const defaults: Preferences = {
  email: "",
  origin: "Gex",
  country: "FR",
  timezone: "Europe/Paris",
  language: "fr",
  group: "family",
  adults: 2,
  childrenAges: [5, 8],
  interests: ["nature", "culture", "créativité"],
  availability: [...slots],
  budget: 40,
  currency: "EUR",
  preferFree: true,
  transport: [{ mode: "transit", maxMinutes: 30 }],
  crossBorder: true,
  stroller: false,
  accessible: false,
  setting: "any",
  consent: true,
};
const slotLabels = {
  "sat-am": "Samedi matin",
  "sat-pm": "Samedi après-midi",
  "sun-am": "Dimanche matin",
  "sun-pm": "Dimanche après-midi",
};
const stepNames = [
  "Votre point de départ",
  "Votre petite tribu",
  "Vos envies",
  "Votre façon de sortir",
];
export function Onboarding({ initial }: { initial?: Preferences }) {
  const router = useRouter();
  const [form, setForm] = useState<Preferences>(initial || defaults);
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(!!initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggle(key: "interests" | "availability", value: string) {
    setForm((f) => ({
      ...f,
      [key]: (f[key] as string[]).includes(value)
        ? (f[key] as string[]).filter((i) => i !== value)
        : [...f[key], value],
    }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step < 3) {
      if (step === 2 && (!form.interests.length || !form.availability.length)) {
        setError("Choisissez au moins une envie et une disponibilité.");
        return;
      }
      setStep((s) => s + 1);
      return;
    }
    if (!consent) {
      setError("Votre accord est nécessaire.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(initial ? "/api/me" : "/api/signup", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push("/mon-weekend");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d’enregistrer");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding-layout">
      <aside className="onboarding-aside">
        <p className="eyebrow">FAISONS CONNAISSANCE</p>
        <h1>
          Un week-end <br />à votre image.
        </h1>
        <p>
          Un peu de vous, beaucoup de possibilités.
          <br />
          Vos préférences restent modifiables.
        </p>
        <ol className="step-nav">
          {stepNames.map((name, i) => (
            <li
              key={name}
              className={step === i ? "active" : step > i ? "done" : ""}
            >
              <span>{step > i ? "✓" : `0${i + 1}`}</span>
              {name}
            </li>
          ))}
        </ol>
        <div className="privacy-note">
          ↳ Un point de départ suffit.
          <br />
          Ni adresse exacte, ni prénom d’enfant.
        </div>
      </aside>
      <form onSubmit={submit} className="form-card">
        <div className="form-top">
          <span className="eyebrow">ÉTAPE {step + 1} SUR 4</span>
          {!initial && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setForm({
                  ...defaults,
                  email: `demo-${Date.now()}@example.test`,
                });
                setConsent(true);
              }}
            >
              Remplir un profil fictif
            </button>
          )}
        </div>
        <h2>{stepNames[step]}</h2>
        {step === 0 && (
          <div className="fields">
            <p>Pour trouver de bonnes idées près de chez vous.</p>
            <label>
              Adresse email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                disabled={!!initial}
                onChange={(e) => update("email", e.target.value)}
                placeholder="vous@example.test"
              />
            </label>
            <small>
              En démonstration, utilisez une adresse fictive. Aucun email n’est
              envoyé.
            </small>
            <label>
              Commune, quartier ou arrêt de départ
              <input
                name="origin"
                required
                maxLength={100}
                value={form.origin}
                onChange={(e) => update("origin", e.target.value)}
              />
            </label>
            <small>
              Villes reconnues en démo : Gex, Ferney-Voltaire,
              Saint-Genis-Pouilly, Divonne-les-Bains, Prévessin-Moëns, Thoiry,
              Cessy, Ornex, Ségny, Genève, Carouge, Meyrin, Vernier, Lancy. Les
              autres points restent en attente de couverture.
            </small>
            <div className="field-pair">
              <label>
                Pays
                <select
                  value={form.country}
                  onChange={(e) => {
                    const country = e.target.value as "FR" | "CH";
                    setForm((f) => ({
                      ...f,
                      country,
                      timezone:
                        country === "FR" ? "Europe/Paris" : "Europe/Zurich",
                      currency: country === "FR" ? "EUR" : "CHF",
                    }));
                  }}
                >
                  <option value="FR">France</option>
                  <option value="CH">Suisse</option>
                </select>
              </label>
              <label>
                Fuseau horaire
                <input
                  required
                  value={form.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                />
              </label>
            </div>
            <label>
              Langue souhaitée
              <select
                value={form.language}
                onChange={(e) =>
                  update("language", e.target.value as Preferences["language"])
                }
              >
                <option value="fr">Français</option>
                <option value="en">
                  English — éditions en français dans cette démo
                </option>
                <option value="de">
                  Deutsch — éditions en français dans cette démo
                </option>
              </select>
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="fields">
            <p>Les envies changent selon les compagnons de route.</p>
            <fieldset>
              <legend>Vous sortez plutôt…</legend>
              <div className="choice-grid">
                {(
                  [
                    ["solo", "En solo", "Un moment pour vous"],
                    ["couple", "À deux", "Des découvertes à partager"],
                    ["friends", "Entre amis", "À plusieurs, c’est mieux"],
                    ["family", "En famille", "Petits et grands ensemble"],
                  ] as const
                ).map(([value, label, sub]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={form.group === value}
                    className={`choice ${form.group === value ? "selected" : ""}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        group: value,
                        adults: value === "solo" ? 1 : 2,
                        childrenAges: value === "family" ? f.childrenAges : [],
                      }))
                    }
                  >
                    <strong>{label}</strong>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Nombre d’adultes
              <input
                type="number"
                min={1}
                max={20}
                required
                value={form.adults}
                onChange={(e) => update("adults", Number(e.target.value))}
              />
            </label>
            {form.group === "family" && (
              <label>
                Âges des enfants, facultatifs
                <input
                  placeholder="Exemple : 5, 8"
                  defaultValue={form.childrenAges.join(", ")}
                  onChange={(e) =>
                    update(
                      "childrenAges",
                      e.target.value.trim()
                        ? e.target.value.split(",").map((s) => Number(s.trim()))
                        : [],
                    )
                  }
                />
                <small>
                  Séparez les âges par des virgules. Aucun prénom n’est demandé.
                </small>
              </label>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="fields">
            <p>Qu’est-ce qui vous donne envie de mettre le nez dehors ?</p>
            <fieldset>
              <legend>Vos centres d’intérêt</legend>
              <div className="chips">
                {interests.map((i) => (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={form.interests.includes(i)}
                    className={`chip ${form.interests.includes(i) ? "active" : ""}`}
                    onClick={() => toggle("interests", i)}
                  >
                    {i}
                    <span>{form.interests.includes(i) ? "✓" : "+"}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Vos disponibilités</legend>
              <div className="choice-grid">
                {slots.map((s) => (
                  <label className="check-label" key={s}>
                    <input
                      type="checkbox"
                      checked={form.availability.includes(s)}
                      onChange={() => toggle("availability", s)}
                    />
                    {slotLabels[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field-pair">
              <label>
                Budget total par sortie
                <input
                  type="number"
                  min={0}
                  max={10000}
                  required
                  value={form.budget}
                  onChange={(e) => update("budget", Number(e.target.value))}
                />
              </label>
              <label>
                Devise
                <select
                  value={form.currency}
                  onChange={(e) =>
                    update("currency", e.target.value as "EUR" | "CHF")
                  }
                >
                  <option value="EUR">EUR · Euro</option>
                  <option value="CHF">CHF · Franc suisse</option>
                </select>
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.preferFree}
                onChange={(e) => update("preferFree", e.target.checked)}
              />
              Privilégier les sorties gratuites
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="fields">
            <p>Des idées qui trouvent leur place dans votre quotidien.</p>
            <fieldset>
              <legend>Déplacements et durée maximale par trajet</legend>
              {modes.map((mode) => {
                const transport = form.transport.find((t) => t.mode === mode);
                return (
                  <div className="transport-row" key={mode}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={!!transport}
                        onChange={(e) =>
                          update(
                            "transport",
                            e.target.checked
                              ? [...form.transport, { mode, maxMinutes: 30 }]
                              : form.transport.filter((t) => t.mode !== mode),
                          )
                        }
                      />
                      {modeLabels[mode]}
                    </label>
                    {transport && (
                      <label className="minutes">
                        <input
                          aria-label={`Minutes maximum ${modeLabels[mode]}`}
                          type="number"
                          required
                          min={1}
                          max={240}
                          value={transport.maxMinutes}
                          onChange={(e) =>
                            update(
                              "transport",
                              form.transport.map((t) =>
                                t.mode === mode
                                  ? { ...t, maxMinutes: Number(e.target.value) }
                                  : t,
                              ),
                            )
                          }
                        />{" "}
                        min
                      </label>
                    )}
                  </div>
                );
              })}
            </fieldset>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.crossBorder}
                onChange={(e) => update("crossBorder", e.target.checked)}
              />
              Je peux traverser la frontière
            </label>
            <div className="field-pair">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.stroller}
                  onChange={(e) => update("stroller", e.target.checked)}
                />
                Accès poussette requis
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.accessible}
                  onChange={(e) => update("accessible", e.target.checked)}
                />
                Accessibilité requise
              </label>
            </div>
            <label>
              Intérieur ou extérieur
              <select
                value={form.setting}
                onChange={(e) =>
                  update("setting", e.target.value as Preferences["setting"])
                }
              >
                <option value="any">Les deux me vont</option>
                <option value="indoor">Intérieur uniquement</option>
                <option value="outdoor">Extérieur uniquement</option>
              </select>
            </label>
            <div className="consent-box">
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                J’accepte la préparation de mes sélections et, après
                confirmation de mon adresse, un email hebdomadaire. Je peux me
                désinscrire à tout moment.
              </label>
              <small>
                Quatre éditions gratuites, puis 24 €/an (2 €/mois, facturés
                annuellement). Aucun paiement ni envoi réel dans cette démo.
              </small>
            </div>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="text-button"
            onClick={() =>
              step > 0
                ? setStep((s) => s - 1)
                : router.push(initial ? "/mon-weekend" : "/")
            }
          >
            ← Retour
          </button>
          <button disabled={busy} className="button primary" type="submit">
            {busy
              ? "Enregistrement…"
              : step === 3
                ? initial
                  ? "Enregistrer mes préférences"
                  : "Préparer mon week-end"
                : "Continuer"}
            <span>→</span>
          </button>
        </div>
      </form>
    </div>
  );
}
