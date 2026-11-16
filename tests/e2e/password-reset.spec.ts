import { test, expect } from "@playwright/test";

const authOrigin = "https://recovery-test.supabase.co";
const user = {
  id: "recovery-user",
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function recoveryFragment() {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from("test-only-signature").toString("base64url")}`;
  return `#type=recovery&access_token=${token}&refresh_token=test-only-refresh`;
}

test("forgot-password link, email submission and delivery errors", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(
    page.getByRole("heading", { name: "Mot de passe oublié", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email administrateur").fill("admin@example.test");
  await page.route("**/api/admin/password-reset", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "admin@example.test",
    });
    await route.fulfill({
      json: {
        message:
          "Si un compte correspond à cette adresse, un lien de réinitialisation va être envoyé.",
      },
    });
  });
  await page.getByRole("button", { name: "Recevoir le lien" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Si un compte correspond",
  );
  await page.route("**/api/admin/password-reset", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "L’envoi est indisponible pour le moment." },
    }),
  );
  await page.getByRole("button", { name: "Recevoir le lien" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "L’envoi est indisponible",
  );
});

test("missing and expired recovery links cannot display a password form", async ({
  page,
}) => {
  for (const suffix of [
    "",
    "#error=access_denied&error_code=otp_expired",
    "#type=signup&access_token=invalid&refresh_token=invalid",
  ]) {
    await page.goto("/admin/forgot-password");
    await page.goto(`/admin/reset-password${suffix}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "invalide ou a expiré",
    );
    await expect(
      page.getByLabel("Nouveau mot de passe", { exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/reset-password$/);
  }
});

test("recovery validates session, confirms password, updates Supabase and returns to login", async ({
  page,
}) => {
  let updates = 0;
  let signedOut = false;
  await page.route(`${authOrigin}/auth/v1/**`, async (route) => {
    const request = route.request();
    if (request.url().includes("/logout")) {
      signedOut = true;
      return route.fulfill({ status: 204 });
    }
    if (request.method() === "PUT") {
      updates++;
      expect(request.postDataJSON().password).toBe("test-password-only-123");
      expect(request.headers().authorization).toMatch(/^Bearer /);
    }
    await route.fulfill({ json: user });
  });
  await page.goto(`/admin/reset-password${recoveryFragment()}`);
  await expect(
    page.getByLabel("Nouveau mot de passe", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/reset-password$/);
  await page
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill("test-password-only-123");
  await page
    .getByLabel("Confirmer le mot de passe")
    .fill("different-password-123");
  await page
    .getByRole("button", { name: "Enregistrer le mot de passe" })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "ne correspondent pas",
  );
  expect(updates).toBe(0);
  await page
    .getByLabel("Confirmer le mot de passe")
    .fill("test-password-only-123");
  await page
    .getByRole("button", { name: "Enregistrer le mot de passe" })
    .click();
  await expect(page.getByRole("status")).toContainText("a été modifié");
  await expect.poll(() => signedOut).toBe(true);
  expect(updates).toBe(1);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.includes("auth-token")),
    ),
  ).toEqual([]);
  await page
    .getByRole("link", { name: "Se connecter à l’administration" })
    .click();
  await expect(
    page.getByRole("button", { name: /Ouvrir l’administration/ }),
  ).toBeVisible();
});

test("a rejected recovery session never permits a password update", async ({
  page,
}) => {
  await page.route(`${authOrigin}/auth/v1/**`, (route) =>
    route.fulfill({
      status: 401,
      json: { code: "bad_jwt", message: "Invalid token" },
    }),
  );
  await page.goto(`/admin/reset-password${recoveryFragment()}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "invalide ou a expiré",
  );
  await expect(
    page.getByLabel("Nouveau mot de passe", { exact: true }),
  ).toHaveCount(0);
});
