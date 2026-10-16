import { test, expect } from "@playwright/test";
import { preferences } from "../fixtures";
const origin = "http://127.0.0.1:3100";

test("onboarding → préparation worker → aperçu → confirmation → retour → désinscription", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /De belles sorties/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/accueil-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Trouver mes prochaines sorties/ })
    .click();
  await page.getByRole("button", { name: "Remplir un profil fictif" }).click();
  await page.getByRole("button", { name: "Continuer", exact: false }).click();
  await page.getByRole("button", { name: "Continuer", exact: false }).click();
  await page.getByRole("button", { name: "Continuer", exact: false }).click();
  await page
    .getByRole("button", { name: "Préparer mon week-end", exact: false })
    .click();
  await expect(page).toHaveURL(/mon-weekend/);
  await expect(
    page.getByRole("heading", { name: /bonnes raisons de sortir/ }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("SORTIE FICTIVE").first()).toBeVisible();
  await page.getByRole("button", { name: /Prévisualiser mon email/ }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: /Votre week-end/ }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator("iframe")
      .getByText(/Événements, sources et trajets fictifs/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await expect(page.frameLocator("iframe").locator("body")).toContainText(
    "DÉMONSTRATION",
  );
  await page
    .getByRole("button", { name: "Obtenir le lien de confirmation" })
    .click();
  await page
    .getByRole("link", { name: /Ouvrir le lien de confirmation/ })
    .click();
  await page.getByRole("button", { name: "Confirmer mon adresse" }).click();
  await expect(page.getByRole("status")).toContainText("confirmée");
  await page.getByRole("link", { name: "Mon espace" }).click();
  await expect(
    page.getByText("Adresse confirmée en démonstration"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Trop loin", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Réduisez votre durée");
  await page.screenshot({
    path: "test-results/selection-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /Ajuster mes préférences/ }).click();
  await page.getByRole("textbox", { name: /Commune, quartier/ }).fill("Cessy");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: /Continuer/ }).click();
  await page
    .getByRole("button", { name: /Enregistrer mes préférences/ })
    .click();
  await expect(page.getByText(/Cessy · En famille/)).toBeVisible();
  await page
    .getByRole("button", { name: "Me désinscrire", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Vous êtes désinscrit");
  await page
    .getByRole("button", { name: "Supprimer mon profil", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmer la suppression" }).click();
  await expect(page).toHaveURL(origin + "/");
  expect(errors).toEqual([]);
});

test("isolation HTTP entre utilisateurs, protections admin et CSRF", async ({
  playwright,
}) => {
  const alice = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const bob = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  const a = await alice.post("/api/signup", { data: preferences() });
  const b = await bob.post("/api/signup", { data: preferences() });
  expect(a.ok()).toBe(true);
  expect(b.ok()).toBe(true);
  const aliceProfile = (await a.json()).profile;
  const bobProfile = (await b.json()).profile;
  const aMe = await (await alice.get("/api/me")).json();
  const bMe = await (await bob.get("/api/me")).json();
  expect(aMe.profile.id).not.toBe(bMe.profile.id);
  const id = aMe.editions[0].id;
  const denied = await bob.get(`/api/editions/${id}/email`);
  expect(denied.status()).toBe(404);
  expect((await anonymous.get("/api/me")).status()).toBe(401);
  expect((await alice.get("/api/admin/data")).status()).toBe(401);
  expect(
    (
      await bob.post("/api/feedback", {
        data: { editionId: id, candidateId: "forest", kind: "known" },
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await bob.patch("/api/me", {
        data: {
          ...preferences(),
          email: bobProfile.email,
          id: aliceProfile.id,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await anonymous.post("/api/signup", {
        data: preferences(),
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  await alice.delete("/api/me");
  await bob.delete("/api/me");
  await alice.dispose();
  await bob.dispose();
  await anonymous.dispose();
});

test("revue protégée et approbation sans envoi", async ({ page, request }) => {
  const input = preferences();
  const created = await request.post("/api/signup", {
    headers: { origin },
    data: input,
  });
  expect(created.ok()).toBe(true);
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("evento-e2e-password");
  await page.getByRole("button", { name: /Ouvrir l’espace de revue/ }).click();
  await expect(
    page.getByRole("heading", { name: "La revue du vendredi." }),
  ).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: /Actualiser/ }).click();
    await expect(
      page.getByRole("button", { name: "Approuver la sélection" }),
    ).toBeVisible();
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "Approuver la sélection" }).click();
  await expect(page.getByRole("status")).toContainText("Aucun email envoyé");
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await request.delete("/api/me", { headers: { origin } });
});

test("l’accueil et le formulaire restent utilisables sur mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/accueil-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Trouver mes prochaines sorties/ })
    .click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/onboarding-mobile.png",
    fullPage: true,
  });
});
