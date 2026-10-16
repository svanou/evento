import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
// A runtime TLS certificate must not become a watched build dependency.
const { readFileSync } = process.getBuiltinModule("node:fs");

import { automationSchema } from "./automation-schema";
import { newsletterSchema } from "./newsletter-schema";
import {
  DatabaseConfigurationError,
  databaseSetupRequired,
} from "./deployment";

type Row = Record<string, unknown>;
let sqlite: DatabaseSync | undefined;
let postgres: Pool | undefined;
export function dataDir() {
  return resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || ".data");
}

const schema = `
CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, email_hash TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, data TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL, version TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, purpose TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS editions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, weekend TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, data TEXT, error TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, UNIQUE(profile_id,weekend,revision));
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL UNIQUE REFERENCES editions(id) ON DELETE CASCADE, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, run_after BIGINT NOT NULL, lease TEXT, locked_until BIGINT, error TEXT, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,run_after);
CREATE TABLE IF NOT EXISTS job_attempts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, attempt INTEGER NOT NULL, state TEXT NOT NULL, error TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, candidate_id TEXT NOT NULL, kind TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(profile_id,edition_id,candidate_id));
CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, weekend TEXT NOT NULL, state TEXT NOT NULL, payload TEXT, provider_id TEXT, error TEXT, updated_at BIGINT NOT NULL, UNIQUE(profile_id,weekend));
CREATE TABLE IF NOT EXISTS delivery_attempts (id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE, state TEXT NOT NULL, error TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);
`;

function local(): DatabaseSync {
  if (process.env.VERCEL) throw new DatabaseConfigurationError();
  if (!sqlite) {
    mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
    sqlite = new DatabaseSync(join(dataDir(), "evento.sqlite"));
    sqlite.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    sqlite.exec(schema);
    sqlite.exec(newsletterSchema);
    sqlite.exec(automationSchema);
    if (
      !(
        sqlite.prepare("PRAGMA table_info(zone_newsletters)").all() as {
          name: string;
        }[]
      ).some((c) => c.name === "dispatch_started_at")
    )
      sqlite.exec(
        "ALTER TABLE zone_newsletters ADD COLUMN dispatch_started_at BIGINT",
      );
    if (
      !(
        sqlite.prepare("PRAGMA table_info(newsletter_deliveries)").all() as {
          name: string;
        }[]
      ).some((c) => c.name === "first_attempt_at")
    )
      sqlite.exec(
        "ALTER TABLE newsletter_deliveries ADD COLUMN first_attempt_at BIGINT",
      );
    // Safe upgrade for early development databases created before payload persistence.
    if (
      !(
        sqlite.prepare("PRAGMA table_info(deliveries)").all() as {
          name: string;
        }[]
      ).some((c) => c.name === "payload")
    )
      sqlite.exec("ALTER TABLE deliveries ADD COLUMN payload TEXT");
  }
  return sqlite;
}

export async function query<T = Row>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  if (databaseSetupRequired()) throw new DatabaseConfigurationError();
  if (process.env.DATABASE_URL) {
    postgres ??= new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      ...(process.env.PGSSLROOTCERT
        ? {
            ssl: {
              rejectUnauthorized: true,
              ca: readFileSync(process.env.PGSSLROOTCERT, "utf8"),
            },
          }
        : {}),
    });
    return (await postgres.query(sql, values)).rows as T[];
  }
  const args: (string | number | null)[] = [];
  const prepared = sql.replace(/\$(\d+)/g, (_, n) => {
    args.push(values[Number(n) - 1] as string | number | null);
    return "?";
  });
  return local()
    .prepare(prepared)
    .all(...args) as T[];
}

export async function initialize() {
  await query("SELECT 1");
}
export async function closeDb() {
  sqlite?.close();
  sqlite = undefined;
  if (postgres) await postgres.end();
  postgres = undefined;
}
export const postgresSchema = schema;
