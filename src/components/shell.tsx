import Link from "next/link";
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Evento, accueil">
      evento<span>✳︎</span>
    </Link>
  );
}
export function Header() {
  return (
    <header className="header">
      <Logo />
      <nav aria-label="Navigation principale">
        <Link href="/#comment">Comment ça marche</Link>
        <Link href="/mon-weekend">
          Mon abonnement <span aria-hidden>→</span>
        </Link>
        <Link className="nav-admin" href="/admin">
          Administration
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <Logo />
      <span>Moins chercher. Plus sortir.</span>
      <Link href="/confidentialite">Vos données & vos choix</Link>
      <span className="footer-place">Première édition : Pays de Gex</span>
    </footer>
  );
}
export function Landscape({ variant = "forest" }: { variant?: string }) {
  return (
    <svg
      viewBox="0 0 520 320"
      className={`landscape landscape-${variant}`}
      role="img"
      aria-label="Illustration d’un paysage imaginaire du Jura"
    >
      <rect width="520" height="320" fill="#e6e9d9" />
      <circle cx="384" cy="83" r="45" fill="#e6a368" />
      <path
        d="M0 214L120 72l94 133 106-158 128 159 72-53v167H0Z"
        fill="#bac8b0"
      />
      <path d="M167 239L320 47l61 85-63-29-23 37-24-12Z" fill="#f5f2e7" />
      <path d="M0 249Q112 153 254 255T520 216V320H0Z" fill="#769482" />
      <path d="M0 294Q134 200 283 276T520 237V320H0Z" fill="#355b49" />
      <path
        d="M274 320q-18-53 22-66t-6-28"
        fill="none"
        stroke="#e7d7ae"
        strokeWidth="14"
      />
      <g fill="#2b4a3c">
        <path d="m52 255 28-68 28 68h-22v39H73v-39Z" />
        <path d="m427 264 25-86 29 86h-23v41h-9v-41Z" />
        <path d="m105 259 21-53 20 53h-16v28h-9v-28Z" />
      </g>
      <path
        d="m93 49 7-5 8 5m23-14 7-5 8 5"
        stroke="#657362"
        fill="none"
        strokeWidth="2"
      />
    </svg>
  );
}
