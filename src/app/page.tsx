import Link from "next/link";
import { Landscape } from "@/components/shell";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-sun">✳︎</span> LE WEEK-END COMMENCE ICI
          </div>
          <h1>
            De belles sorties.
            <br />
            Les vôtres<span className="orange">.</span>
          </h1>
          <p className="hero-description">
            Chaque vendredi, les bonnes idées pour votre week-end, choisies
            selon vos envies.
            <br />
            Vous n’avez plus qu’à en profiter.
          </p>
          <div className="hero-actions">
            <Link href="/inscription" className="button primary">
              Trouver mes prochaines sorties <span>→</span>
            </Link>
            <span className="small-note">
              Quelques minutes pour nous parler de vous.
            </span>
          </div>
          <div className="hero-proof">
            <span className="outline-icon">⌁</span>
            <span>
              Pays de Gex & Genève
              <br />
              <small>Notre première zone d’exploration</small>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="floating-label">
            Votre prochaine parenthèse <span>↙</span>
          </div>
          <div className="sample-card">
            <div className="sample-top">
              <span className="sample-dot" /> UN APERÇU DE VOTRE VENDREDI{" "}
              <span>01 / 05</span>
            </div>
            <Landscape />
            <div className="sample-content">
              <div className="tag-row">
                <span className="tag">NATURE</span>
                <span className="subtle">Exemple fictif</span>
              </div>
              <h2>
                Et si on prenait
                <br />
                la clé des champs ?
              </h2>
              <p>
                Un peu d’air frais, une petite découverte.
                <br />
                Une idée qui vous ressemble.
              </p>
              <div className="sample-bottom">
                <span>Au rythme de vos envies</span>
                <span className="round-arrow">→</span>
              </div>
            </div>
          </div>
          <span className="art-spark">✳︎</span>
          <div className="note-card">
            <span>✓</span>
            <div>
              Fait pour vous.
              <br />
              <small>Pas pour tout le monde.</small>
            </div>
          </div>
        </div>
      </section>
      <section className="promise-strip">
        <span>Vos envies, pas un algorithme opaque.</span>
        <span>Jusqu’à 5 idées, jamais du remplissage.</span>
        <span>Un vendredi. Un email. C’est tout.</span>
      </section>
      <section id="comment" className="how-section">
        <div className="section-intro">
          <div>
            <p className="eyebrow">SIMPLE COMME UN WEEK-END</p>
            <h2>La curiosité fait le reste.</h2>
          </div>
          <p>
            On s’occupe de chercher.
            <br />
            Vous gardez le plaisir de choisir.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span className="step-index">01</span>
            <h3>Racontez-nous vos envies</h3>
            <p>
              Votre point de départ, vos compagnons de sortie, votre budget et
              votre façon de bouger.
            </p>
          </article>
          <article>
            <span className="step-index">02</span>
            <h3>Recevez vos idées</h3>
            <p>
              Jusqu’à cinq propositions pour le week-end. Des sources visibles
              et des incertitudes signalées.
            </p>
          </article>
          <article>
            <span className="step-index">03</span>
            <h3>Faites de la place à l’imprévu</h3>
            <p>
              Une expo, un atelier, un bol d’air. Dites-nous ce qui vous plaît
              et ajustez vos préférences.
            </p>
          </article>
        </div>
      </section>
      <section className="pricing">
        <div>
          <p className="eyebrow">UN PETIT RENDEZ-VOUS, DE GRANDES ENVIES</p>
          <h2>Essayez quatre vendredis.</h2>
          <p>
            Quatre éditions gratuites. Puis{" "}
            <strong>2 €/mois, facturés annuellement</strong> (24 €/an).
            <br />
            Un modèle à tester ensemble. Aucun paiement n’est activé dans cette
            démo.
          </p>
        </div>
        <Link href="/inscription" className="button light">
          Créer mon profil fictif <span>→</span>
        </Link>
      </section>
    </>
  );
}
