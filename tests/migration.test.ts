import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

it("applique la migration PostgreSQL, refuse les accès clients et active réellement la RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      "INSERT INTO profiles(id,email_hash,revision,data,created_at) VALUES('alice','hash-alice',1,'{}',1),('bob','hash-bob',1,'{}',1);",
    );
    const enabled = await db.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      "SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'",
    );
    expect(enabled.rows).toHaveLength(12);
    expect(enabled.rows.every((t) => t.relrowsecurity)).toBe(true);
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM profiles")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec(
      "RESET ROLE; GRANT SELECT ON profiles TO authenticated; SET ROLE authenticated;",
    );
    // Even an accidentally granted SELECT cannot bypass the deny policy.
    expect((await db.query("SELECT * FROM profiles")).rows).toHaveLength(0);
    await expect(
      db.exec(
        "INSERT INTO profiles(id,email_hash,revision,data,created_at) VALUES('mallory','hash',1,'{}',1)",
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE;");
    expect((await db.query("SELECT * FROM profiles")).rows).toHaveLength(2);
  } finally {
    await db.close();
  }
}, 30000);
