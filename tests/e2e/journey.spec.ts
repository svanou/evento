import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { candidate, testZone } from "../fixtures";
import { query, closeDb } from "../../src/lib/db";
import { subscribe, enqueue } from "../../src/lib/store";
import { newToken } from "../../src/lib/security";
import { buildEdition } from "../../src/lib/pipeline";
import { weekendFor } from "../../src/lib/domain";
const origin = "http://127.0.0.1:3100";
process.env.DATA_DIR = process.env.EVENTO_E2E_DATA_DIR!;
process.env.DATABASE_URL = "";
process.env.SESSION_SECRET = "e2e-isolated-environment-secret-32-chars";
test.afterAll(async () => {
  await closeDb();
});
async function login(page: Page) {
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("evento-e2e-only");
  await page.getByRole("button", { name: /Ouvrir/ }).click();
  await expect(
    page.getByRole("tab", { name: "Zones", exact: true }),
  ).toBeVisible();
}
test("accueil réel, inscription fermée sans email et protection des routes", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/agenda-pays-de-gex/);
  await expect(
    page.getByRole("heading", { name: /Le week-end/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/SORTIE FICTIVE|24 €|Remplir un profil/),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: /Recevoir la newsletter gratuite/ })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /M’inscrire gratuitement/ }),
  ).toBeDisabled();
  await expect(page.getByText(/inscriptions ouvrent bientôt/)).toBeVisible();
  expect((await request.get("/api/admin/data")).status()).toBe(401);
  expect((await request.get("/api/cron/tasks")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/tasks/run", {
        headers: { origin },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/me")).status()).toBe(401);
  expect(
    (
      await request.post("/api/signup", {
        headers: { origin: "https://evil.example" },
        data: {
          email: "test@example.test",
          zone: "pays-de-gex",
          consent: true,
        },
      })
    ).status(),
  ).toBe(403);
  const signup = await request.post("/api/signup", {
    headers: { origin },
    data: { email: "test@example.test", zone: "pays-de-gex", consent: true },
  });
  expect(signup.status()).toBe(400);
  expect((await query("SELECT * FROM subscribers")).length).toBe(0);
});
test("ajouter une zone, ses sources et sa page depuis le backend", async ({
  page,
}) => {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  await login(page);
  await page.getByRole("tab", { name: "Zones", exact: true }).click();
  await page.getByLabel("Nom de la zone").fill("Zone du test navigateur");
  await page.getByLabel("Identifiant de page").fill(slug);
  await page
    .getByRole("button", { name: "Créer la zone en brouillon" })
    .click();
  await expect(
    page.getByRole("button", { name: /Zone du test navigateur/ }),
  ).toBeVisible();
  expect((await page.request.get(`/agenda-${slug}`)).status()).toBe(404);
  await page
    .getByRole("combobox", { name: "Zone de travail" })
    .selectOption(slug);
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Source du test");
  await page
    .getByLabel("Adresse de l’agenda")
    .fill("https://example.org/test-source");
  await page.getByRole("button", { name: "Enregistrer la source" }).click();
  await expect(
    page.getByRole("button", { name: /Source du test/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Zones", exact: true }).click();
  await page.getByRole("button", { name: /Zone du test navigateur/ }).click();
  await page.getByLabel("Statut", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Enregistrer la zone" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(`/agenda-${slug}`);
  await expect(
    page.getByText(/ZONE DU TEST NAVIGATEUR · LA NEWSLETTER/),
  ).toBeVisible();
  await page.goto(`/inscription?zone=${slug}`);
  await expect(page.getByLabel("Votre zone", { exact: true })).toHaveValue(
    slug,
  );
});
test("revue, aperçu, approbation et abonnement sans aucun envoi externe", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Fixtures only enter the isolated E2E database; product code has no seed events.
  const current = new Date();
  const future = DateTime.fromJSDate(current).plus({ days: 14 }).toJSDate();
  const weekend = weekendFor(future, testZone.timezone);
  const edition = await enqueue(testZone.id, future);
  const content = buildEdition(
    testZone,
    weekend,
    [
      candidate({
        date: weekend.saturday,
        sourceYear: Number(weekend.saturday.slice(0, 4)),
        checkedAt: current.toISOString(),
      }),
    ],
    current,
  );
  await query(
    "UPDATE zone_newsletters SET content=$1,preparation_status='ready' WHERE id=$2",
    [JSON.stringify(content), edition.id],
  );
  const reader = await subscribe(`${randomUUID()}@example.test`, testZone.id);
  await context.addCookies([
    {
      name: "evento_subscriber",
      value: reader.session,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/mon-weekend");
  await expect(
    page.getByText("Votre zone prépare son prochain rendez-vous."),
  ).toBeVisible();
  await login(page);
  await page
    .getByLabel("Objet de l’email")
    .fill("Objet enregistré par le test");
  await page.getByLabel(/Ajouter un encart sponsorisé/).check();
  await page.getByLabel("Nom du partenaire").fill("Partenaire du test");
  await page.getByLabel("Titre de l’encart").fill("Encart du test");
  await page
    .getByLabel("Texte de l’encart")
    .fill("Publicité de test, sans diffusion réelle.");
  await page
    .getByLabel("Lien du partenaire")
    .fill("https://example.org/partner");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await expect(
    page.getByRole("button", { name: "Programmer", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Envoyer maintenant" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Prévisualiser l’email" }).click();
  await expect(
    page.frameLocator("iframe").getByText("PUBLICITÉ — PARTENAIRE LOCAL"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await expect(page.frameLocator("iframe").locator("body")).toContainText(
    "https://example.org/tests/event",
  );
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Annuler la programmation" }),
  ).toBeVisible();
  await page.getByLabel("Objet de l’email").fill("Version à relire");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByText("Version 3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Programmer", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approuver cette version" }).click();
  await expect(
    page.getByRole("button", { name: "Programmer", exact: true }),
  ).toBeEnabled();
  await context.clearCookies({ name: "evento_admin" });
  await page.goto("/mon-weekend");
  await expect(
    page.getByRole("heading", { name: "Version à relire" }),
  ).toBeVisible();
  const token = await newToken(reader.subscriber!.id, "confirm", 60000);
  await page.goto(`/lien/confirm#token=${token}`);
  await page.getByRole("button", { name: "Confirmer mon adresse" }).click();
  await expect(page.getByRole("status")).toContainText("confirmée");
  await page.goto("/mon-weekend");
  await expect(
    page.getByText("Adresse confirmée", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Me désinscrire", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Vous êtes désinscrit");
  await page
    .getByRole("button", { name: "Supprimer mes données", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmer la suppression" }).click();
  await expect(page).toHaveURL(/agenda-pays-de-gex/);
  expect(
    await query("SELECT * FROM subscribers WHERE id=$1", [
      reader.subscriber!.id,
    ]),
  ).toHaveLength(0);
  expect(
    await query("SELECT * FROM zone_newsletters WHERE id=$1", [edition.id]),
  ).toHaveLength(1);
  expect(await query("SELECT * FROM newsletter_deliveries")).toHaveLength(0);
  expect(errors).toEqual([]);
});
test("accueil et inscription utilisables sur mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("link", { name: /Recevoir la newsletter gratuite/ })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("la préparation démarre après la réponse sans worker et reste consultable après fermeture", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByText("Traitements automatiques", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Date dans la semaine à préparer").fill("2027-06-09");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/prepare") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Préparer l’édition", exact: true })
    .click();
  const accepted = await response;
  expect(accepted.status()).toBe(202);
  const { edition } = await accepted.json();
  await page.close();
  await expect
    .poll(
      async () =>
        (
          await query<{ status: string }>(
            "SELECT status FROM newsletter_jobs WHERE newsletter_id=$1",
            [edition.id],
          )
        )[0]?.status,
    )
    .toBe("failed");
  const result = (
    await query<{ content: string | null; error: string }>(
      "SELECT content,error FROM zone_newsletters WHERE id=$1",
      [edition.id],
    )
  )[0];
  expect(result.content).toBeNull();
  expect(result.error).toContain("non configurée");
  await expect
    .poll(
      async () =>
        (
          await query<{ lease: string | null }>(
            "SELECT lease FROM automation_state WHERE id='runner'",
          )
        )[0]?.lease,
    )
    .toBeNull();
});
