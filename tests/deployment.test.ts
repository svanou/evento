import { afterEach, expect, it, vi } from "vitest";
import {
  databaseSetupRequired,
  DatabaseConfigurationError,
} from "../src/lib/deployment";
import { query } from "../src/lib/db";

afterEach(() => vi.unstubAllEnvs());
it("refuse explicitement SQLite sur Vercel sans DATABASE_URL, y compris une valeur vide", async () => {
  vi.stubEnv("VERCEL", "1");
  for (const value of ["", "   "]) {
    vi.stubEnv("DATABASE_URL", value);
    expect(databaseSetupRequired()).toBe(true);
    await expect(query("SELECT 1")).rejects.toBeInstanceOf(
      DatabaseConfigurationError,
    );
  }
});
it("conserve SQLite en local et les zones dynamiques avec PostgreSQL configuré", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("DATABASE_URL", "");
  expect(databaseSetupRequired()).toBe(false);
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  expect(databaseSetupRequired()).toBe(false);
});
