"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "L’envoi a échoué.");
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-login">
      <p className="eyebrow">ADMINISTRATION</p>
      <h1>Mot de passe oublié</h1>
      <form className="form-card fields" onSubmit={submit} aria-busy={busy}>
        <p>Recevez un lien par email pour choisir un nouveau mot de passe.</p>
        <label>
          Email administrateur
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Envoi en cours…" : "Recevoir le lien"}
        </button>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <Link href="/admin">Retour à la connexion</Link>
      </form>
    </div>
  );
}
