import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import * as database from "../src/lib/db";
import { automationStatus, runAutomation } from "../src/lib/automation";
import { queueBroadcast } from "../src/lib/dispatch";
import {
  approveNewsletter,
  confirmSubscriber,
  enqueue,
  getNewsletter,
  subscribe,
  unsubscribe,
} from "../src/lib/store";
import { TestDiscovery } from "./fixtures";

// Run the actual workflow SQL on both supported database engines. No external calls.
describe.each(["sqlite", "postgres"])("Vercel tasks (%s)", (engine) => {
  let directory: string;
  let pg: PGlite | undefined;
  const now = new Date();
  const provider = new TestDiscovery(now);
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "evento-automation-"));
    vi.stubEnv("DATA_DIR", directory);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv(
      "SESSION_SECRET",
      "automation-unit-tests-secret-with-32-characters",
    );
    vi.stubEnv("TEST_REFERENCE_DATE", now.toISOString());
    vi.stubEnv("SCHEDULER_ENABLED", "false");
    vi.stubEnv("RESEND_API_KEY", "test-only-never-used");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubEnv(
      "EMAIL_TEST_ALLOWLIST",
      "a@example.test,b@example.test,c@example.test,late@example.test",
    );
    if (engine === "postgres") {
      pg = new PGlite();
      await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
      for (const file of [
        "001_initial",
        "002_zone_newsletters",
        "003_vercel_tasks",
      ]) {
        await pg.exec(
          readFileSync(
            new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
            "utf8",
          ),
        );
      }
      vi.spyOn(database, "query").mockImplementation(
        async (sql, values = []) =>
          (await pg!.query(sql, values)).rows as never,
      );
    }
  }, 30000);
  beforeEach(async () => {
    vi.stubEnv("EMAIL_MODE", "test");
    await database.query("DELETE FROM zone_newsletters");
    await database.query("DELETE FROM subscribers");
    await database.query(
      "UPDATE automation_state SET lease=NULL,locked_until=NULL,last_error=NULL",
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await pg?.close();
    await database.closeDb();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  const nextEdition = () =>
    enqueue("pays-de-gex", new Date(now.getTime() + 14 * 86400000));
  async function approved() {
    const edition = await nextEdition();
    await runAutomation({
      source: "admin",
      provider,
      newsletterId: edition.id,
    });
    await approveNewsletter(edition.id, 1, "test");
    return edition;
  }
  async function readers() {
    const ids: string[] = [];
    for (const email of [
      "a@example.test",
      "b@example.test",
      "c@example.test",
    ]) {
      const { subscriber } = await subscribe(email, "pays-de-gex");
      await confirmSubscriber(subscriber!.id);
      ids.push(subscriber!.id);
    }
    return ids;
  }
  it("claims one requested preparation, leaves the other durable, and recovers an expired runner", async () => {
    const first = await nextEdition();
    const second = await enqueue(
      "pays-de-gex",
      new Date(now.getTime() + 28 * 86400000),
    );
    await database.query(
      "UPDATE automation_state SET lease='old',locked_until=$1",
      [Date.now() + 300000],
    );
    expect((await runAutomation({ source: "cron", provider })).busy).toBe(true);
    expect((await getNewsletter(first.id))!.content).toBeNull();
    await database.query("UPDATE automation_state SET locked_until=1");
    expect(
      (
        await runAutomation({
          source: "admin",
          provider,
          newsletterId: second.id,
        })
      ).prepared,
    ).toBe(1);
    expect((await getNewsletter(first.id))!.preparation_status).toBe("queued");
    expect((await getNewsletter(second.id))!.preparation_status).toBe("ready");
    expect((await automationStatus()).pendingPreparations).toBe(1);
  });
  it("resumes bounded batches without duplicates and excludes new or unsubscribed readers", async () => {
    const edition = await approved();
    await readers();
    await queueBroadcast(edition.id);
    const transport = { send: vi.fn(async () => ({ id: "test-only" })) };
    const run = () =>
      runAutomation({ source: "admin", provider, transport, deliveryLimit: 1 });
    expect((await run()).delivered).toBe(1);
    expect((await getNewsletter(edition.id))!.send_status).toBe("sending");
    const pending = await database.query<{ subscriber_id: string }>(
      "SELECT subscriber_id FROM newsletter_deliveries WHERE state='queued'",
    );
    await unsubscribe(pending[0].subscriber_id);
    const late = await subscribe("late@example.test", "pays-de-gex");
    await confirmSubscriber(late.subscriber!.id);
    // Deterministic boundary: this confirmation occurs after the frozen cutoff.
    await database.query("UPDATE subscribers SET confirmed_at=$1 WHERE id=$2", [
      Date.now() + 1000,
      late.subscriber!.id,
    ]);
    await run();
    await run();
    await run();
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect((await getNewsletter(edition.id))!.send_status).toBe("sent");
    expect(
      await database.query(
        "SELECT * FROM newsletter_deliveries WHERE subscriber_id=$1",
        [late.subscriber!.id],
      ),
    ).toHaveLength(0);
  });
  it("does no external work without enough time and retains queued dispatches", async () => {
    const edition = await approved();
    await readers();
    await queueBroadcast(edition.id);
    const transport = { send: vi.fn(async () => ({ id: "test" })) };
    expect(
      (await runAutomation({ source: "cron", transport, budgetMs: 1000 }))
        .delivered,
    ).toBe(0);
    expect(transport.send).not.toHaveBeenCalled();
    expect((await getNewsletter(edition.id))!.send_status).toBe("sending");
  });
  it("requires explicit retry with the same idempotency keys and never replays ambiguous sends", async () => {
    const edition = await approved();
    await readers();
    await queueBroadcast(edition.id);
    const keys: string[] = [];
    await runAutomation({
      source: "admin",
      transport: {
        send: async (_mail, key) => {
          keys.push(key);
          throw new Error("test transport failure");
        },
      },
    });
    expect((await getNewsletter(edition.id))!.send_status).toBe("failed");
    const retried: string[] = [];
    const transport = {
      send: async (_mail: unknown, key: string) => {
        retried.push(key);
        return { id: "test" };
      },
    };
    await runAutomation({ source: "cron", transport });
    expect(retried).toHaveLength(0);
    await queueBroadcast(edition.id);
    await database.query(
      "UPDATE newsletter_deliveries SET state='sending' WHERE id=$1",
      [keys[0]],
    );
    await runAutomation({ source: "admin", transport });
    expect(retried.sort()).toEqual(keys.slice(1).sort());
    await expect(queueBroadcast(edition.id)).rejects.toThrow("ambigu");
  });
  it("fails closed for test recipients and refuses stale editions", async () => {
    const edition = await approved();
    await readers();
    await confirmSubscriber(
      (await subscribe("not-allowed@example.test", "pays-de-gex")).subscriber!
        .id,
    );
    await expect(queueBroadcast(edition.id)).rejects.toThrow("liste de test");
    expect(
      await database.query("SELECT * FROM newsletter_deliveries"),
    ).toHaveLength(0);
    await database.query(
      "UPDATE zone_newsletters SET weekend='2020-01-04' WHERE id=$1",
      [edition.id],
    );
    await expect(queueBroadcast(edition.id)).rejects.toThrow("périmée");
  });
  it("caps a default invocation at 50 deliveries and preserves the remainder", async () => {
    const edition = await approved();
    const emails = Array.from(
      { length: 51 },
      (_, i) => `batch-${i}@example.test`,
    );
    vi.stubEnv("EMAIL_TEST_ALLOWLIST", emails.join(","));
    for (const email of emails)
      await confirmSubscriber(
        (await subscribe(email, "pays-de-gex")).subscriber!.id,
      );
    await queueBroadcast(edition.id);
    const transport = { send: vi.fn(async () => ({ id: "test" })) };
    expect((await runAutomation({ source: "cron", transport })).delivered).toBe(
      50,
    );
    expect((await getNewsletter(edition.id))!.send_status).toBe("sending");
    expect((await runAutomation({ source: "cron", transport })).delivered).toBe(
      1,
    );
    expect(transport.send).toHaveBeenCalledTimes(51);
    expect((await getNewsletter(edition.id))!.send_status).toBe("sent");
  });
});
