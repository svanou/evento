import type { Metadata } from "next";
import { Header, Footer, DemoBanner } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "Evento — Votre week-end, bien trouvé",
  description:
    "Chaque vendredi, des idées de sorties adaptées à vos envies. Démonstration locale pour le Pays de Gex et Genève.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        <DemoBanner />
        <div className="site">
          <Header />
          <main id="contenu">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
