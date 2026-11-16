"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const invalidLink =
  "Ce lien est invalide ou a expiré. Demandez un nouveau lien de réinitialisation.";

export function ResetPassword({
  url,
  publishableKey,
}: {
  url: string;
  publishableKey: string;
}) {
  const client = useRef<SupabaseClient | null>(null);
  const initialization = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<
    "checking" | "ready" | "invalid" | "done"
  >("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!initialization.current) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      // Recovery credentials stay in memory, never in browser storage or history.
      window.history.replaceState(null, "", window.location.pathname);
      initialization.current = (async () => {
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (
          !url ||
          !publishableKey ||
          params.get("type") !== "recovery" ||
          !access_token ||
          !refresh_token ||
          params.has("error")
        )
          return false;
        try {
          const supabase = createClient(url, publishableKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          client.current = supabase;
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          return !error && !!data.user;
        } catch {
          return false;
        }
      })();
    }
    void initialization.current.then((valid) => {
      if (active) setStatus(valid ? "ready" : "invalid");
    });
    return () => {
      active = false;
    };
  }, [url, publishableKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || status !== "ready" || !client.current) return;
    setError("");
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 12 || password.length > 256) {
      setError("Choisissez un mot de passe de 12 à 256 caractères.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.current.auth.updateUser({ password });
      if (error) {
        if (
          [
            "session_not_found",
            "refresh_token_not_found",
            "refresh_token_already_used",
          ].includes(error.code || "") ||
          error.status === 401 ||
          error.status === 403
        ) {
          setStatus("invalid");
        } else {
          setError(
            error.code === "same_password"
              ? "Choisissez un mot de passe différent de l’ancien."
              : error.code === "weak_password"
                ? "Ce mot de passe est trop faible. Choisissez-en un plus long et unique."
                : "Le mot de passe n’a pas pu être modifié. Réessayez.",
          );
        }
        return;
      }
      setPassword("");
      setConfirmation("");
      setStatus("done");
      // Supabase sessions are revoked; the app still requires its normal admin login.
      await client.current.auth.signOut().catch(() => undefined);
      client.current = null;
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-login">
      <p className="eyebrow">ADMINISTRATION</p>
      <h1>Nouveau mot de passe</h1>
      <div className="form-card fields">
        {status === "checking" && <p role="status">Vérification du lien…</p>}
        {status === "invalid" && (
          <>
            <p role="alert" className="notice error">
              {invalidLink}
            </p>
            <Link href="/admin/forgot-password">Recevoir un nouveau lien</Link>
          </>
        )}
        {status === "done" && (
          <>
            <p role="status" className="notice">
              Votre mot de passe a été modifié. Vous pouvez maintenant vous
              connecter.
            </p>
            <Link className="button primary" href="/admin">
              Se connecter à l’administration
            </Link>
          </>
        )}
        {status === "ready" && (
          <form className="fields" onSubmit={submit} aria-busy={busy}>
            <p>Choisissez un mot de passe unique d’au moins 12 caractères.</p>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirmer le mot de passe
              <input
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
