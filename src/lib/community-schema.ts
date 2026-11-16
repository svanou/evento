export const communitySchema = `
CREATE TABLE IF NOT EXISTS sponsor_inquiries (
 id TEXT PRIMARY KEY, zone TEXT NOT NULL REFERENCES newsletter_zones(id),
 name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at BIGINT NOT NULL
);
`;
export const communityColumns = {
  newsletter_sources: {
    description: "TEXT NOT NULL DEFAULT ''",
    visual: "TEXT NOT NULL DEFAULT 'village'",
  },
  zone_newsletters: {
    calendar_revision: "INTEGER",
    calendar_published_at: "BIGINT",
  },
};
