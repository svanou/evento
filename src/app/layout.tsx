import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import "./globals.css";
import { appUrl } from "@/lib/security";
export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: "Evento — Les newsletters gratuites de votre coin",
  description:
    "Une sélection de sorties par zone. Gratuit pour les lecteurs, avec des partenaires locaux clairement identifiés. Première zone : Pays de Gex.",
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
        <div className="newsletter-banner">
          LA NEWSLETTER LOCALE · GRATUITE POUR LES LECTEURS
        </div>
        <div className="site">
          <Header />
          <main id="contenu">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
