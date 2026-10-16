"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
export default function LinkPage({
  params,
}: {
  params: Promise<{ purpose: string }>;
}) {
  const { purpose } = use(params);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    );
  }, []);
  async function apply() {
    setBusy(true);
    try {
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDone(true);
      history.replaceState(null, "", location.pathname);
      setMessage(
        purpose === "unsubscribe"
          ? "Vous êtes désinscrit. Aucun nouvel email ne sera envoyé."
          : purpose === "confirm"
            ? "Votre adresse est confirmée."
            : "Votre session de gestion est ouverte.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Impossible d’utiliser ce lien",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="empty-state">
      <p className="eyebrow">VOUS GARDEZ LA MAIN</p>
      <h1>
        {purpose === "confirm"
          ? "Bienvenue dans l’aventure."
          : purpose === "unsubscribe"
            ? "À chacun son rythme."
            : "Votre abonnement, vos choix."}
      </h1>
      <p>Ce lien est sécurisé, temporaire et utilisable une seule fois.</p>
      {!done && (
        <button
          className="button primary"
          disabled={!token || busy}
          onClick={apply}
        >
          {busy
            ? "Un instant…"
            : purpose === "confirm"
              ? "Confirmer mon adresse"
              : purpose === "unsubscribe"
                ? "Confirmer ma désinscription"
                : "Ouvrir mon abonnement"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {done && (
        <Link
          className="button secondary"
          href={purpose === "manage" ? "/mon-weekend" : "/mon-weekend"}
        >
          Mon espace →
        </Link>
      )}
    </div>
  );
}
