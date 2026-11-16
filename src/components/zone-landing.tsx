import Link from "next/link";
import { Landscape } from "./shell";
import { SourceDirectory } from "./source-directory";
import { SponsorInquiryForm } from "./sponsor-inquiry";
import type { PublicSource } from "@/lib/community";
const days = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi"];
export function ZoneLanding({
  id = "pays-de-gex",
  name = "Pays de Gex",
  day = 4,
  sources = [],
}: {
  id?: string;
  name?: string;
  day?: number;
  sources?: PublicSource[];
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
            idées repérées grâce à notre veille active des agendas locaux, des
            mairies et des lieux culturels.
            <br />
            Vous n’avez plus qu’à choisir.
          </p>
          <div className="hero-actions">
            <Link href={`/inscription?zone=${id}`} className="button primary">
              Recevoir la newsletter gratuite <span>→</span>
            </Link>
            <Link
              href={`/agenda-${id}/calendrier`}
              className="calendar-hero-link"
            >
              Explorer le calendrier des événements ↗
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
      <section className="source-section" id="sources">
        <div className="section-intro">
          <div>
            <p className="eyebrow">LES YEUX OUVERTS SUR VOTRE COIN</p>
            <h2>
              Une veille active.
              <br />
              Des sources à découvrir.
            </h2>
          </div>
          <p>
            Agendas municipaux, associations, lieux culturels et Instagram :
            <br />
            notre point de départ, c’est la vie locale.
          </p>
        </div>
        <div className="watch-method">
          <p>
            Pour préparer chaque édition, nous croisons les agendas locaux de la
            zone {name}, repérons les sorties et vérifions leurs informations
            pratiques. Les propositions incertaines sont mises de côté pour être
            contrôlées.
          </p>
          <p>
            Les informations peuvent évoluer : chaque événement renvoie à sa
            source et indique sa date de consultation. Cette sélection ne
            prétend pas couvrir tous les événements.
          </p>
        </div>
        <SourceDirectory sources={sources} zoneName={name} />
      </section>
      <section className="calendar-invite">
        <div>
          <p className="eyebrow">VOTRE PROCHAIN RENDEZ-VOUS</p>
          <h2>
            Et si on regardait
            <br />
            le calendrier ?
          </h2>
          <p>
            Par date, par envie. Retrouvez les événements publiés dans votre
            zone et leurs informations pratiques.
          </p>
        </div>
        <Link className="button light" href={`/agenda-${id}/calendrier`}>
          Voir les événements de {name} →
        </Link>
      </section>
      <section className="local-sponsors" id="partenaires">
        <div className="sponsor-pitch">
          <p className="eyebrow">
            LA NEWSLETTER LOCALE · LES PARTENAIRES LOCAUX
          </p>
          <h2>
            Votre activité fait
            <br />
            vivre le coin.
            <br />
            <em>Faisons-la connaître.</em>
          </h2>
          <p>
            Un commerce, un restaurant, un lieu culturel ou une initiative à
            faire découvrir ? Soutenez la newsletter {name} et présentez votre
            activité dans un encart dédié.
          </p>
          <ul>
            <li>Une présence dans la newsletter de votre zone.</li>
            <li>Un message et un lien vers votre activité.</li>
            <li>
              Une collaboration définie ensemble, sans engagement via ce
              formulaire.
            </li>
          </ul>
          <div className="sponsor-transparency">
            <strong>La confiance avant tout.</strong>
            <p>
              Chaque encart porte la mention « Publicité — partenaire local ».
              Le sponsoring reste séparé de notre sélection de sorties. Aucune
              donnée individuelle des lecteurs n’est partagée.
            </p>
          </div>
        </div>
        <SponsorInquiryForm zone={id} name={name} />
      </section>
    </>
  );
}
