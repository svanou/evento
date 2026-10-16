import { initialize, closeDb } from "../src/lib/db";
await initialize();
console.log(
  "Stockage accessible. En PostgreSQL, appliquer supabase/migrations/001_initial.sql puis 002_zone_newsletters.sql avant le démarrage.",
);
await closeDb();
