"use client";

import { useState } from "react";
import type { PublicSource } from "@/lib/community";
import { sourceKinds, type SourceKind } from "@/lib/source-display";
import { SourceArt } from "./source-art";

export function SourceLogo({
  source,
}: {
  source: Pick<PublicSource, "name" | "url" | "logo_url" | "logo_background">;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState("");
  const host = new URL(source.url).hostname;
  const shared =
    /(^|\.)(instagram\.com|facebook\.com|helloasso\.com|pepsup\.com|wixsite\.com)$/.test(
      host,
    );
  const icon = shared
    ? ""
    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  const logo =
    source.logo_url && !failed.includes(source.logo_url) ? source.logo_url : "";
  const src = logo || (icon && !failed.includes(icon) ? icon : "");
  const initials = source.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (
    <span
      className={`source-logo ${logo && source.logo_background === "dark" ? "source-logo-dark" : ""}`}
    >
      {src && (
        // Small original brand assets; no server-side fetch of admin-provided URLs.
        <img
          src={src}
          alt={`${logo ? "Logo" : "Icône du site"} · ${source.name}`}
          width={88}
          height={64}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{ opacity: loaded === src ? 1 : 0 }}
          ref={(node) => {
            // A cached image can finish before hydration attaches its handlers.
            if (!node?.complete) return;
            if (node.naturalWidth > 0) setLoaded(src);
            else
              setFailed((urls) => (urls.includes(src) ? urls : [...urls, src]));
          }}
          onLoad={() => setLoaded(src)}
          onError={() =>
            setFailed((urls) => (urls.includes(src) ? urls : [...urls, src]))
          }
        />
      )}
      {(!src || loaded !== src) && (
        <span aria-label={`Initiales · ${source.name}`}>{initials}</span>
      )}
    </span>
  );
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function SourceDirectory({
  sources,
  zoneName,
}: {
  sources: PublicSource[];
  zoneName: string;
}) {
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(12);
  const filtered = sources.filter(
    (s) =>
      (kind === "all" || (s.source_kind || "agenda") === kind) &&
      normalize(`${s.name} ${s.description || ""} ${s.url}`).includes(
        normalize(search),
      ),
  );
  return (
    <div>
      <div className="source-count">
        <span className="status-dot" /> {sources.length} sources référencées ·{" "}
        {zoneName}
        <small>Logos et icônes des sites · initiales si indisponibles</small>
      </div>
      <div className="source-controls">
        <label>
          Rechercher une source
          <input
            type="search"
            placeholder="Commune, association, compte…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(12);
            }}
          />
        </label>
        <label>
          Type de source
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SourceKind | "all");
              setLimit(12);
            }}
          >
            <option value="all">Toutes les sources ({sources.length})</option>
            {Object.entries(sourceKinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label} (
                {
                  sources.filter((s) => (s.source_kind || "agenda") === value)
                    .length
                }
                )
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small-note">
        Les comptes Instagram et les annuaires complètent le repérage manuel.
        Leur référencement ne signifie pas que leurs publications sont
        surveillées automatiquement. Les informations sont recoupées avant de
        retenir une sortie.
      </p>
      <p className="small-note" role="status">
        {filtered.length} source{filtered.length === 1 ? "" : "s"} trouvée
        {filtered.length === 1 ? "" : "s"}
      </p>
      <div className="source-grid">
        {filtered.slice(0, limit).map((source) => (
          <article className="source-card" key={source.id}>
            <div className="source-brand">
              <SourceArt visual={source.visual} />
              <SourceLogo source={source} />
            </div>
            <div className="source-copy">
              <span className="eyebrow">
                {sourceKinds[source.source_kind || "agenda"]} · {zoneName}
              </span>
              <h3>{source.name}</h3>
              <p>
                {source.description ||
                  "Une source locale pour repérer les rendez-vous et vérifier leurs informations pratiques."}
              </p>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.source_kind === "instagram"
                  ? "Voir le compte Instagram"
                  : "Découvrir la source"}{" "}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && <p>Aucune source pour cette recherche.</p>}
      {filtered.length > limit && (
        <button
          className="button secondary source-more"
          onClick={() => setLimit((n) => n + 12)}
        >
          Afficher plus de sources ({filtered.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
