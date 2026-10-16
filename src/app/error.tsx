"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section className="empty-state">
      <h1>Cette page est momentanément indisponible.</h1>
      <p>Nous ne pouvons pas charger son contenu pour le moment.</p>
      <button className="button secondary" onClick={() => retry()}>
        Réessayer
      </button>
    </section>
  );
}
