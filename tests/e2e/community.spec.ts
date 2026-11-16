import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
import { query, closeDb } from "../../src/lib/db";
import { enqueue } from "../../src/lib/store";
import { buildEdition } from "../../src/lib/pipeline";
import { weekendFor } from "../../src/lib/domain";
import { candidate, testZone } from "../fixtures";
process.env.DATA_DIR = process.env.EVENTO_E2E_DATA_DIR!;
process.env.DATABASE_URL = "";
const origin = "http://127.0.0.1:3100";
test.afterAll(async () => {
  await closeDb();
});
test("sources par zone, calendrier publié et demande sponsor jusqu’au dashboard", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const now = new Date();
  const weekend = weekendFor(
    DateTime.fromJSDate(now).plus({ days: 7 }).toJSDate(),
    testZone.timezone,
  );
  const edition = await enqueue(
    testZone.id,
    DateTime.fromISO(weekend.saturday).toJSDate(),
  );
  const content = buildEdition(
    testZone,
    weekend,
    [
      candidate({
        title: "Atelier du calendrier de test",
        date: weekend.saturday,
        sourceYear: Number(weekend.saturday.slice(0, 4)),
        checkedAt: now.toISOString(),
      }),
    ],
    now,
  );
  await query(
    "UPDATE zone_newsletters SET content=$1,preparation_status='ready' WHERE id=$2",
    [JSON.stringify(content), edition.id],
  );
  await query(
    "INSERT INTO newsletter_sources(id,zone,name,url,enabled,notes,description,visual,created_at) VALUES('e2e-community','pays-de-gex','Agenda local de test','https://example.org',1,'NOTE PRIVÉE DU TEST','Une description publique de la veille.','culture',0)",
  );
  await page.goto("/agenda-pays-de-gex");
  await expect(
    page.getByRole("heading", { name: /Une veille active/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Une description publique de la veille."),
  ).toBeVisible();
  await expect(page.getByText("NOTE PRIVÉE DU TEST")).toHaveCount(0);
  await page.getByLabel("Votre établissement").fill("Sponsor navigateur");
  await page.getByLabel("Email professionnel").fill("sponsor@example.test");
  await page
    .getByLabel("Votre idée de partenariat")
    .fill("Une proposition locale pour la newsletter.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Proposer un partenariat/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Votre proposition est bien arrivée",
  );
  expect(
    (
      await request.post(`/api/admin/newsletters/${edition.id}/calendar`, {
        headers: { origin },
        data: { revision: 1, published: true },
      })
    ).status(),
  ).toBe(401);
  await page.goto(
    `/agenda-pays-de-gex/calendrier?mois=${weekend.saturday.slice(0, 7)}`,
  );
  await expect(
    page.getByRole("heading", { name: content.articles[0].title }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("evento-e2e-only");
  await page.getByRole("button", { name: /Ouvrir/ }).click();
  await page.getByRole("button", { name: /Publier au calendrier/ }).click();
  await expect(
    page.getByRole("button", { name: "Retirer du calendrier" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Partenariats", exact: true }).click();
  await expect(page.getByText("Sponsor navigateur")).toBeVisible();
  await page.goto(
    `/agenda-pays-de-gex/calendrier?mois=${weekend.saturday.slice(0, 7)}`,
  );
  await expect(
    page.getByRole("heading", { name: content.articles[0].title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "nature", exact: true }).click();
  await expect(
    page.getByText("Aucune sortie publiée pour ce mois et ce filtre.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toutes les sorties" }).click();
  await page.getByRole("button", { name: /1 événement$/ }).click();
  await expect(
    page.getByRole("button", { name: "Voir tout le mois" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Mois suivant" }).click();
  await expect(
    page.getByRole("heading", { name: content.articles[0].title }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/agenda-pays-de-gex/calendrier?mois=${weekend.saturday.slice(0, 7)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/agenda-pays-de-gex");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await query("SELECT * FROM newsletter_deliveries")).toHaveLength(0);
  expect(errors).toEqual([]);
});
