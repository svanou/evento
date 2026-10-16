"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type Zone } from "@/lib/domain";
export function Onboarding() {
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [zone, setZone] = useState("pays-de-gex");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  useEffect(() => {
    setZone(
      new URLSearchParams(window.location.search).get("zone") || "pays-de-gex",
    );
    fetch("/api/zones")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setZones(data.zones);
        setRegistrationOpen(data.registrationOpen);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, zone, consent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/mon-weekend");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inscription impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding-layout">
      <aside className="onboarding-aside">
        <p className="eyebrow">LE RENDEZ-VOUS LOCAL · GRATUIT</p>
        <h1>
          Votre zone.
          <br />
          Un email.
          <br />
          De belles sorties.
        </h1>
        <p>
          La même sélection soignée pour tous les lecteurs de votre zone. Pas de
          questionnaire personnel, pas d’abonnement payant.
        </p>
        <div className="privacy-note">
          Votre email et votre zone suffisent.
          <br />
          Désinscription en un clic de confirmation.
        </div>
      </aside>
      <form className="form-card fields" onSubmit={submit}>
        <p className="eyebrow">INSCRIPTION À LA NEWSLETTER</p>
        <h2>On vous garde une place ?</h2>
        <label>
          Votre zone
          <select
            aria-label="Votre zone"
            required
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <option value="" disabled>
              Choisir une zone
            </option>
            {zones.map((z) => (
              <option value={z.id} key={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <small>
          Nous commençons par le Pays de Gex. Les nouvelles zones apparaîtront
          après leur ouverture.
        </small>
        <label>
          Adresse email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          J’accepte de recevoir la newsletter gratuite de cette zone, incluant
          éventuellement un encart partenaire clairement identifié. Je peux me
          désinscrire à tout moment.
        </label>
        <button
          type="submit"
          disabled={
            !registrationOpen || busy || !zones.some((z) => z.id === zone)
          }
          className="button primary"
        >
          {busy ? "Inscription…" : "M’inscrire gratuitement →"}
        </button>
        <small>
          {registrationOpen
            ? "Confirmez ensuite votre adresse grâce au lien reçu par email."
            : "Les inscriptions ouvrent bientôt. L’envoi des confirmations n’est pas encore activé."}
        </small>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
