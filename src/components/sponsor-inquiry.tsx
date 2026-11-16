"use client";
import { useState } from "react";
import Link from "next/link";
export function SponsorInquiryForm({
  zone,
  name,
}: {
  zone: string;
  name: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  if (state === "sent")
    return (
      <div className="sponsor-confirmation" role="status">
        <h3>Votre proposition est bien arrivée.</h3>
        <p>
          L’équipe Evento pourra vous recontacter au sujet de la newsletter{" "}
          {name}. Aucun abonnement ni paiement n’a été créé.
        </p>
      </div>
    );
  return (
    <form
      className="fields sponsor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setState("busy");
        setError("");
        try {
          const res = await fetch("/api/partenariats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              zone,
              name: data.get("name"),
              email: data.get("email"),
              message: data.get("message"),
              consent: data.get("consent") === "on",
              website: data.get("website"),
            }),
          });
          const json = await res.json();
          if (!res.ok)
            throw new Error(json.error || "Enregistrement impossible");
          setState("sent");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Erreur réseau, réessayez.",
          );
          setState("idle");
        }
      }}
    >
      <h3>Parlons de votre projet.</h3>
      <p>
        Newsletter concernée : <strong>{name}</strong>
      </p>
      <label>
        Votre établissement
        <input
          name="name"
          required
          maxLength={150}
          autoComplete="organization"
        />
      </label>
      <label>
        Email professionnel
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <label>
        Votre idée de partenariat
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          placeholder="Votre activité, les dates envisagées, ce que vous souhaitez faire découvrir…"
        />
      </label>
      <div hidden aria-hidden="true">
        <label>
          Site de contrôle
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="check-label">
        <input type="checkbox" name="consent" required />
        J’accepte qu’Evento utilise ces informations pour me recontacter au
        sujet de ce partenariat.
      </label>
      <small>
        Ces informations restent réservées à l’équipe.{" "}
        <Link href="/confidentialite">Utilisation des données</Link>.
      </small>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={state === "busy"}>
        {state === "busy" ? "Enregistrement…" : "Proposer un partenariat →"}
      </button>
    </form>
  );
}
