import Link from "next/link";
import { Landscape } from "./shell";
const days = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi"];
export function ZoneLanding({
  id = "pays-de-gex",
  name = "Pays de Gex",
  day = 4,
}: {
  id?: string;
  name?: string;
  day?: number;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-sun">✳</span> {name.toUpperCase()} · LA
            NEWSLETTER GRATUITE
          </p>
          <h1>
            Le week-end
            <br />
            commence ici<span className="orange">.</span>
          </h1>
          <p className="hero-description">
            Chaque {days[day]}, une sélection de sorties dans votre coin. Des
            idées issues des agendas locaux, selon les sorties disponibles.
            <br />
            Vous n’avez plus qu’à choisir.
          </p>
          <div className="hero-actions">
            <Link href={`/inscription?zone=${id}`} className="button primary">
              Recevoir la newsletter gratuite <span>→</span>
            </Link>
            <span className="small-note">
              Un email par semaine. Votre zone, tout simplement.
            </span>
          </div>
          <div className="hero-proof">
            <span className="outline-icon">⌁</span>
            <span>
              {name}
              <br />
              <small>Des idées locales, à partager autour de vous</small>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="floating-label">Le rendez-vous de votre coin ↙</div>
          <div className="sample-card">
            <div className="sample-top">
              <span className="sample-dot" /> LA NEWSLETTER ·{" "}
              {name.toUpperCase()} <span>LES SORTIES DU COIN</span>
            </div>
            <Landscape />
            <div className="sample-content">
              <div className="tag-row">
                <span className="tag">UNE ENVIE DE SORTIR</span>
                <span className="subtle">Paysage illustré</span>
              </div>
              <h2>
                On fait quoi
                <br />
                ce week-end ?
              </h2>
              <p>
                Un bol d’air, un atelier, une rencontre.
                <br />
                Le meilleur point de départ : près de chez vous.
              </p>
              <div className="sample-bottom">
                <span>Une édition commune à votre zone</span>
                <span className="round-arrow">→</span>
              </div>
            </div>
          </div>
          <div className="note-card">
            <span>✓</span>
            <div>
              Local. Gratuit.
              <br />
              <small>Et facile à partager.</small>
            </div>
          </div>
        </div>
      </section>
      <section className="promise-strip">
        <span>Une vraie sélection éditoriale.</span>
        <span>Des sources visibles et consultables.</span>
        <span>Un email, chaque {days[day]}.</span>
      </section>
      <section id="comment" className="how-section">
        <div className="section-intro">
          <div>
            <p className="eyebrow">MOINS CHERCHER. PLUS SORTIR.</p>
            <h2>La curiosité fait le reste.</h2>
          </div>
          <p>
            On prépare les idées.
            <br />
            Vous choisissez le programme.
          </p>
        </div>
        <div className="steps-grid">
          <article>
            <span className="step-index">01</span>
            <h3>Choisissez votre zone</h3>
            <p>
              Une adresse email et votre coin. Pas de profil détaillé ni de
              questionnaire d’intérêts.
            </p>
          </article>
          <article>
            <span className="step-index">02</span>
            <h3>Retrouvez votre sélection</h3>
            <p>
              Les agendas locaux alimentent un brouillon relu avant diffusion.
              Les sources et les informations inconnues restent visibles.
            </p>
          </article>
          <article>
            <span className="step-index">03</span>
            <h3>Faites-en votre week-end</h3>
            <p>
              Choisissez ce qui vous plaît et partagez vos découvertes avec vos
              proches. Les réservations se font chez les organisateurs.
            </p>
          </article>
        </div>
      </section>
      <section className="pricing">
        <div>
          <p className="eyebrow">GRATUIT POUR LES LECTEURS</p>
          <h2>Un média local, soutenu localement.</h2>
          <p>
            Des partenaires locaux pourront financer la newsletter.
            <br />
            Leur encart sera toujours identifié{" "}
            <strong>« Publicité — partenaire local »</strong>, à part de la
            sélection.
          </p>
        </div>
        <Link href={`/inscription?zone=${id}`} className="button light">
          Rejoindre la newsletter →
        </Link>
      </section>
    </>
  );
}
