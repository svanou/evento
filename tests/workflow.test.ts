import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { query, closeDb } from "../src/lib/db";
import {
  subscribe,
  enqueue,
  getNewsletter,
  newsletters,
  editNewsletter,
  approveNewsletter,
  scheduleNewsletter,
  unsubscribe,
  deleteSubscriber,
  confirmSubscriber,
  getSubscriber,
  retryPreparation,
} from "../src/lib/store";
import { getZone, listZones, saveZone } from "../src/lib/zones";
import { processOne, schedule } from "../src/lib/jobs";
import { sendDelivery, dispatchDue } from "../src/lib/delivery";
import { newToken, tokenOwner } from "../src/lib/security";
import { type Content, type Edit } from "../src/lib/domain";
import { TestDiscovery, now, testZone } from "./fixtures";
const directory = mkdtempSync(join(tmpdir(), "evento-zone-tests-"));
beforeAll(() => {
  process.env.DATA_DIR = directory;
  process.env.TEST_REFERENCE_DATE = now.toISOString();
  process.env.EMAIL_MODE = "disabled";
  delete process.env.DATABASE_URL;
});
afterAll(async () => {
  await closeDb();
  rmSync(directory, { recursive: true, force: true });
});
const reader = () => subscribe(`${randomUUID()}@example.test`, "pays-de-gex");
const editFor = (content: Content, revision: number): Edit => ({
  revision,
  subject: content.subject,
  introduction: content.introduction,
  articles: content.articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
  })),
  sponsor: content.sponsor,
});
it("plusieurs lecteurs partagent une seule édition et ne déclenchent pas de recherche", async () => {
  const a = await reader();
  const b = await reader();
  expect(await query("SELECT * FROM newsletter_jobs")).toHaveLength(0);
  const first = await enqueue("pays-de-gex");
  const again = await enqueue("pays-de-gex");
  expect(first.id).toBe(again.id);
  await Promise.all([
    processOne(new TestDiscovery()),
    processOne(new TestDiscovery()),
  ]);
  const ready = (await getNewsletter(first.id))!;
  expect(ready.preparation_status).toBe("ready");
  expect((JSON.parse(ready.content!) as Content).articles).toHaveLength(1);
  expect(await tokenOwner(a.session, "session")).toBe(a.subscriber!.id);
  expect(await tokenOwner(b.session, "session")).not.toBe(a.subscriber!.id);
  expect(await query("SELECT * FROM newsletter_jobs")).toHaveLength(1);
});
it("l’édition modifiée exige une nouvelle approbation et résiste aux écritures concurrentes", async () => {
  const edition = (await newsletters("pays-de-gex"))[0];
  const content = JSON.parse(edition.content!) as Content;
  await approveNewsletter(edition.id, edition.revision, "test-admin");
  await query(
    "UPDATE zone_newsletters SET send_status='scheduled',scheduled_at=$1 WHERE id=$2",
    [Date.now() + 10000, edition.id],
  );
  const edit = {
    ...editFor(content, edition.revision),
    subject: "Nouvel objet éditorial",
  };
  await editNewsletter(edition.id, edit, "test-admin");
  const updated = (await getNewsletter(edition.id))!;
  expect(updated.preparation_status).toBe("ready");
  expect(updated.approved_revision).toBeNull();
  expect(updated.scheduled_at).toBeNull();
  await expect(editNewsletter(edition.id, edit, "test-admin")).rejects.toThrow(
    "entre-temps",
  );
  await expect(
    editNewsletter(
      edition.id,
      {
        ...edit,
        revision: updated.revision,
        articles: [
          {
            id: "invented",
            title: "Inventé",
            description: "Non issu des sources",
          },
        ],
      },
      "test-admin",
    ),
  ).rejects.toThrow("vérifiées");
});
it("crée une zone en brouillon, exige une source avant ouverture et ne la mélange pas au Pays de Gex", async () => {
  const geneva = {
    ...testZone,
    id: "geneve",
    name: "Genève",
    country: "CH",
    currency: "CHF",
    timezone: "Europe/Zurich",
    status: "draft" as const,
  };
  await saveZone(geneva, true);
  expect((await listZones()).map((z) => z.id)).not.toContain("geneve");
  await expect(subscribe("other@example.test", "geneve")).rejects.toThrow(
    "pas encore ouverte",
  );
  await expect(
    saveZone({ ...geneva, status: "active" }, false),
  ).rejects.toThrow("source active");
  await query(
    "INSERT INTO newsletter_sources(id,zone,name,url,enabled,notes,created_at) VALUES('geneva-test','geneve','Source test','https://example.org',1,'Test',0)",
  );
  await saveZone({ ...geneva, status: "active" }, false);
  expect((await listZones()).map((z) => z.id)).toContain("geneve");
  const edition = await enqueue("geneve");
  await processOne(new TestDiscovery());
  expect((await getNewsletter(edition.id))!.zone).toBe("geneve");
  expect(
    (await newsletters("pays-de-gex")).every((n) => n.zone === "pays-de-gex"),
  ).toBe(true);
});
it("garde un échec visible et reprend la même édition après correction du fournisseur", async () => {
  const edition = await enqueue("pays-de-gex", new Date("2026-10-23T06:00Z"));
  await processOne({
    discover: async () => {
      throw new Error("Fournisseur indisponible");
    },
  });
  expect((await getNewsletter(edition.id))!.preparation_status).toBe("queued");
  await query("UPDATE newsletter_jobs SET run_after=0 WHERE newsletter_id=$1", [
    edition.id,
  ]);
  await processOne(new TestDiscovery());
  expect((await getNewsletter(edition.id))!.preparation_status).toBe("ready");
  expect(
    await query(
      "SELECT * FROM newsletter_attempts WHERE job_id IN (SELECT id FROM newsletter_jobs WHERE newsletter_id=$1)",
      [edition.id],
    ),
  ).toHaveLength(2);
});
it("sans clé réelle la préparation échoue sans générer de faux événements", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  const edition = await enqueue("pays-de-gex", new Date("2026-10-30T06:00Z"));
  await processOne();
  const failed = (await getNewsletter(edition.id))!;
  expect(failed.preparation_status).toBe("failed");
  expect(failed.content).toBeNull();
  expect(failed.error).toContain("non configurée");
});
it("refuse l’envoi sans activation, approbation, confirmation ou liste de test", async () => {
  const reader = await subscribe("deliver@example.test", "pays-de-gex");
  const id = reader.subscriber!.id;
  const edition = (await newsletters("pays-de-gex")).find(
    (n) => n.weekend === "2026-10-17",
  )!;
  let calls = 0;
  const transport = {
    send: async () => {
      calls++;
      return { id: "test-only" };
    },
  };
  await expect(sendDelivery(edition.id, id, transport)).rejects.toThrow(
    "Approbation",
  );
  await approveNewsletter(edition.id, edition.revision, "test-admin");
  await expect(sendDelivery(edition.id, id, transport)).rejects.toThrow(
    "non confirmé",
  );
  await confirmSubscriber(id);
  await expect(sendDelivery(edition.id, id, transport)).rejects.toThrow(
    "désactivé",
  );
  process.env.EMAIL_MODE = "test";
  process.env.RESEND_API_KEY = "unit-test-only";
  process.env.EMAIL_FROM = "test@example.test";
  process.env.EMAIL_TEST_ALLOWLIST = "other@example.test";
  await expect(sendDelivery(edition.id, id, transport)).rejects.toThrow(
    "liste de test",
  );
  process.env.EMAIL_TEST_ALLOWLIST = "deliver@example.test";
  const results = await Promise.all([
    sendDelivery(edition.id, id, transport),
    sendDelivery(edition.id, id, transport),
  ]);
  expect(calls).toBe(1);
  expect(results.sort()).toEqual(["not_claimed", "sent"]);
  await expect(
    editNewsletter(
      edition.id,
      editFor(JSON.parse(edition.content!), edition.revision),
      "test-admin",
    ),
  ).rejects.toThrow("commencé");
  process.env.EMAIL_MODE = "disabled";
});
it("reprend un échec d’envoi avec la même clé et le même contenu", async () => {
  const r = await subscribe("retry@example.test", "pays-de-gex");
  await confirmSubscriber(r.subscriber!.id);
  const edition = (await newsletters("pays-de-gex")).find(
    (n) => n.weekend === "2026-10-24",
  )!;
  await approveNewsletter(edition.id, edition.revision, "test-admin");
  process.env.EMAIL_MODE = "test";
  process.env.EMAIL_TEST_ALLOWLIST = "retry@example.test";
  const keys: string[] = [];
  const texts: string[] = [];
  await expect(
    sendDelivery(edition.id, r.subscriber!.id, {
      send: async (mail, key) => {
        keys.push(key);
        texts.push(mail.text);
        throw new Error("Erreur transport test");
      },
    }),
  ).rejects.toThrow("transport");
  await sendDelivery(edition.id, r.subscriber!.id, {
    send: async (mail, key) => {
      keys.push(key);
      texts.push(mail.text);
      return { id: "recovered" };
    },
  });
  expect(keys[0]).toBe(keys[1]);
  expect(texts[0]).toBe(texts[1]);
  process.env.EMAIL_MODE = "disabled";
});
it("la désinscription et la suppression n’effacent pas l’édition partagée", async () => {
  const r = await reader();
  await confirmSubscriber(r.subscriber!.id);
  await unsubscribe(r.subscriber!.id);
  expect(
    (await getSubscriber(r.subscriber!.id))!.unsubscribed_at,
  ).not.toBeNull();
  const before = (await newsletters("pays-de-gex")).length;
  await deleteSubscriber(r.subscriber!.id);
  expect(await getSubscriber(r.subscriber!.id)).toBeNull();
  expect(await tokenOwner(r.session, "session")).toBeNull();
  expect((await newsletters("pays-de-gex")).length).toBe(before);
});
it("les liens sont temporaires et à usage unique", async () => {
  const r = await reader();
  const token = await newToken(r.subscriber!.id, "confirm", 10000);
  expect(await tokenOwner(token, "confirm", true)).toBe(r.subscriber!.id);
  expect(await tokenOwner(token, "confirm", true)).toBeNull();
  expect(
    await tokenOwner(await newToken(r.subscriber!.id, "manage", -1), "manage"),
  ).toBeNull();
});
it("la planification reste idempotente et bloque clairement une échéance sans email actif", async () => {
  await schedule(new Date("2026-11-04T09:00:00Z"));
  await schedule(new Date("2026-11-04T10:00:00Z"));
  const rows = await query<{ id: string }>(
    "SELECT id FROM zone_newsletters WHERE zone='pays-de-gex' AND weekend='2026-11-07'",
  );
  expect(rows).toHaveLength(1);
  await query(
    "UPDATE zone_newsletters SET send_status='scheduled',scheduled_at=1 WHERE id=$1",
    [rows[0].id],
  );
  await dispatchDue();
  expect((await getNewsletter(rows[0].id))!.send_status).toBe("blocked");
});

it("une recherche vide reste vide, ne s’approuve pas et peut être relancée après ajout de sources", async () => {
  // Finish any scheduler jobs before isolating this edition.
  while (await processOne(new TestDiscovery())) {
    /* no external provider */
  }
  const edition = await enqueue(
    "pays-de-gex",
    new Date("2027-01-15T09:00:00Z"),
  );
  await processOne({ discover: async () => [] });
  const empty = (await getNewsletter(edition.id))!;
  expect(JSON.parse(empty.content!).articles).toEqual([]);
  await expect(
    approveNewsletter(edition.id, empty.revision, "test-admin"),
  ).rejects.toThrow("au moins une sortie");
  await retryPreparation(edition.id);
  expect((await getNewsletter(edition.id))!.content).toBeNull();
  await processOne(new TestDiscovery());
  expect(
    JSON.parse((await getNewsletter(edition.id))!.content!).articles,
  ).toHaveLength(1);
});
