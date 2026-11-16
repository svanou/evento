export const sourceKinds = {
  agenda: "Agendas officiels",
  association: "Associations & clubs",
  lieu: "Lieux & festivals",
  instagram: "Instagram",
  annuaire: "Annuaires locaux",
} as const;
export type SourceKind = keyof typeof sourceKinds;

// Shared platforms and directories are discovery leads, not evidence that
// every page hosted on their domain belongs to the selected local source.
export function isResearchSource(source: {
  url: string;
  source_kind?: string;
}) {
  const host = new URL(source.url).hostname.replace(/^www\./, "");
  return (
    !["instagram", "annuaire"].includes(source.source_kind || "") &&
    !["instagram.com", "facebook.com", "helloasso.com"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  );
}
