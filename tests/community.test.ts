import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { query, closeDb } from "../src/lib/db";
import {
  calendarEvents,
  publishCalendar,
  publicSources,
  saveSponsorInquiry,
} from "../src/lib/community";
import { enqueue, editNewsletter, getNewsletter } from "../src/lib/store";
import { buildEdition } from "../src/lib/pipeline";
import { weekendFor, editSchema } from "../src/lib/domain";
import { candidate, now, testZone } from "./fixtures";
const directory = mkdtempSync(join(tmpdir(), "evento-community-"));
beforeAll(async () => {
  process.env.DATA_DIR = directory;
  process.env.DATABASE_URL = "";
  process.env.TEST_REFERENCE_DATE = now.toISOString();
  await query(
    "INSERT INTO newsletter_sources(id,zone,name,url,enabled,notes,description,created_at) VALUES('community-test','pays-de-gex','Source visible','https://example.org',1,'NOTE PRIVÉE','Description publique',0)",
  );
  await query(
    "INSERT INTO newsletter_zones(id,name,timezone,country,currency,language,status,send_day,send_hour) VALUES('ailleurs','Ailleurs','Europe/Paris','FR','EUR','fr','active',4,8)",
  );
});
afterAll(async () => {
  await closeDb();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.TEST_REFERENCE_DATE;
});
it("publie 12 sorties, masque les brouillons et les révisions non republiées, sans envoyer", async () => {
  const edition = await enqueue(testZone.id, now);
  const content = buildEdition(
    testZone,
    weekendFor(now, testZone.timezone),
    Array.from({ length: 13 }, (_, i) =>
      candidate({
        id: `e${i}`,
        title: `Sortie ${i}`,
        sourceUrl: `https://example.org/${i}`,
      }),
    ),
    now,
  );
  expect(content.articles).toHaveLength(12);
  const edit = {
    revision: edition.revision,
    subject: content.subject,
    introduction: content.introduction,
    articles: content.articles.map(({ id, title, description }) => ({
      id,
      title,
      description,
    })),
    sponsor: null,
  };
  expect(editSchema.safeParse(edit).success).toBe(true);
  expect(
    editSchema.safeParse({
      ...edit,
      articles: [
        ...edit.articles,
        { id: "extra", title: "T", description: "D" },
      ],
    }).success,
  ).toBe(false);
  await query(
    "UPDATE zone_newsletters SET content=$1,preparation_status='ready' WHERE id=$2",
    [JSON.stringify(content), edition.id],
  );
  expect(await calendarEvents(testZone.id, "2026-10")).toHaveLength(0);
  await publishCalendar(edition.id, 1, true, "test");
  expect(await calendarEvents(testZone.id, "2026-10")).toHaveLength(12);
  expect(await calendarEvents("ailleurs", "2026-10")).toHaveLength(0);
  expect(await calendarEvents(testZone.id, "2026-11")).toHaveLength(0);
  expect((await getNewsletter(edition.id))?.send_status).toBe("not_scheduled");
  await editNewsletter(edition.id, edit, "test");
  expect(await calendarEvents(testZone.id, "2026-10")).toHaveLength(0);
  await expect(publishCalendar(edition.id, 1, true, "test")).rejects.toThrow(
    "entre-temps",
  );
  await publishCalendar(edition.id, 2, true, "test");
  expect(await calendarEvents(testZone.id, "2026-10")).toHaveLength(12);
  await query(
    "UPDATE newsletter_sources SET enabled=0 WHERE id='community-test'",
  );
  expect(await calendarEvents(testZone.id, "2026-10")).toHaveLength(0);
  await expect(publishCalendar(edition.id, 2, true, "test")).rejects.toThrow(
    "Recontrôlez",
  );
  await publishCalendar(edition.id, 2, false, "test");
  expect((await getNewsletter(edition.id))?.calendar_revision).toBeNull();
  expect(await query("SELECT * FROM newsletter_deliveries")).toHaveLength(0);
});
it("ne montre que les sources actives de la zone et jamais les notes privées", async () => {
  await query(
    "UPDATE newsletter_sources SET enabled=1 WHERE id='community-test'",
  );
  const sources = await publicSources(testZone.id);
  expect(sources.some((s) => s.description === "Description publique")).toBe(
    true,
  );
  expect(JSON.stringify(sources)).not.toContain("NOTE PRIVÉE");
  expect(await publicSources("ailleurs")).toEqual([]);
});
it("vérifie consentement et zone des demandes de partenariat sans créer d’abonnement", async () => {
  const input = {
    zone: testZone.id,
    name: "Établissement du test",
    email: "contact@example.test",
    message: "Proposition de partenariat local",
    consent: true,
  };
  await expect(
    saveSponsorInquiry({ ...input, consent: false }),
  ).rejects.toThrow();
  await expect(
    saveSponsorInquiry({ ...input, zone: "unknown" }),
  ).rejects.toThrow();
  await saveSponsorInquiry({ ...input, website: "spam" });
  expect(await query("SELECT * FROM sponsor_inquiries")).toHaveLength(0);
  await saveSponsorInquiry(input);
  expect(
    await query("SELECT * FROM sponsor_inquiries WHERE zone=$1", [testZone.id]),
  ).toHaveLength(1);
  expect(await query("SELECT * FROM subscribers")).toHaveLength(0);
});
