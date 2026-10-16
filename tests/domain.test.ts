import { describe, it, expect } from "vitest";
import {
  weekendFor,
  defaultSendAt,
  safeSourceUrl,
  signupSchema,
} from "../src/lib/domain";
import { buildEdition } from "../src/lib/pipeline";
import { renderEmail } from "../src/lib/email";
import { withDeadline } from "../src/lib/deadline";
import { validateResearch } from "../src/lib/openai-discovery";
import { candidate, testZone, now } from "./fixtures";
const weekend = weekendFor(now, testZone.timezone);
const links = {
  manage: "https://example.org/manage",
  unsubscribe: "https://example.org/unsubscribe",
};
it("calcule le week-end, les changements d’année et les fuseaux", () => {
  expect(weekend.key).toBe("2026-10-17");
  expect(
    weekendFor(new Date("2026-10-18T22:30Z"), "America/Los_Angeles").key,
  ).toBe("2026-10-17");
  expect(
    weekendFor(new Date("2026-10-18T22:30Z"), "Pacific/Kiritimati").key,
  ).toBe("2026-10-24");
  expect(weekendFor(new Date("2026-12-31T12:00Z"), "Europe/Paris").key).toBe(
    "2027-01-02",
  );
  expect(defaultSendAt(weekend, testZone)).toBe(
    "2026-10-15T08:00:00.000+02:00",
  );
  expect(
    defaultSendAt(
      weekendFor(new Date("2026-10-28T10:00Z"), "Europe/Paris"),
      testZone,
    ),
  ).toContain("08:00:00.000+01:00");
});
it("l’inscription ne collecte que l’email, la zone et l’accord", () => {
  expect(
    signupSchema.parse({
      email: "Alice@Example.test ",
      zone: "pays-de-gex",
      consent: true,
    }).email,
  ).toBe("alice@example.test");
  expect(() =>
    signupSchema.parse({
      email: "a@example.test",
      zone: "pays-de-gex",
      consent: true,
      childrenAges: [5],
    }),
  ).toThrow();
  expect(() =>
    signupSchema.parse({
      email: "a@example.test",
      zone: "pays-de-gex",
      consent: false,
    }),
  ).toThrow();
});
it("écarte les doublons, événements passés, contradictions et autres zones", () => {
  const list = [
    candidate(),
    candidate({ id: "duplicate" }),
    candidate({ id: "old", date: "2025-06-01" }),
    candidate({ id: "conflict", title: "Autre", conflict: true }),
    candidate({ id: "other-zone", title: "Autre zone", zone: "geneve" }),
  ];
  const result = buildEdition(testZone, weekend, list, now);
  expect(result.articles).toHaveLength(1);
  expect(result.reviews.filter((r) => r.decision === "excluded")).toHaveLength(
    4,
  );
});
it("ne remplit pas artificiellement cinq places et n’invente pas les inconnues", () => {
  const content = buildEdition(testZone, weekend, [candidate()], now);
  const email = renderEmail(testZone, content, links);
  expect(content.articles).toHaveLength(1);
  expect(email.text).toContain("Tarif non renseigné");
  expect(email.text).toContain("horaire non renseigné");
  expect(email.text).toContain("information inconnue");
  expect(email.text).not.toContain("min en");
  expect(buildEdition(testZone, weekend, [], now).articles).toHaveLength(0);
});
it("contrôle les années, les preuves périmées et les récurrences", () => {
  const content = buildEdition(
    testZone,
    weekend,
    [
      candidate({ sourceYear: 2025 }),
      candidate({ id: "b", title: "B", checkedAt: "2026-01-01T00:00:00Z" }),
      candidate({ id: "c", title: "C", occurrenceConfirmed: false }),
    ],
    now,
  );
  expect(content.articles).toHaveLength(0);
  expect(content.reviews.every((r) => r.decision === "check")).toBe(true);
});
it("refuse toute fiche explicitement fictive et échappe le HTML", () => {
  expect(
    buildEdition(testZone, weekend, [candidate({ fictitious: true })], now)
      .articles,
  ).toHaveLength(0);
  const content = buildEdition(
    testZone,
    weekend,
    [candidate({ title: '<script>alert("x")</script>' })],
    now,
  );
  expect(renderEmail(testZone, content, links).html).toContain(
    "&lt;script&gt;",
  );
  content.articles[0].fictitious = true;
  expect(() => renderEmail(testZone, content, links)).toThrow("interdite");
});
it("isole et identifie la publicité sans modifier les sorties sélectionnées", () => {
  const content = buildEdition(testZone, weekend, [candidate()], now);
  content.sponsor = {
    name: "Partenaire du test",
    title: "Encart du test",
    body: "Message commercial du test",
    url: "https://example.org/sponsor",
  };
  const email = renderEmail(testZone, content, links);
  expect(email.html.indexOf("</article>")).toBeLessThan(
    email.html.indexOf("<aside"),
  );
  expect(email.text).toContain("PUBLICITÉ — PARTENAIRE LOCAL");
  expect(content.articles).toHaveLength(1);
});
it("vérifie les preuves contre les URLs réellement rapportées par la recherche", () => {
  const source = {
    id: "test",
    zone: testZone.id,
    name: "Test",
    url: "https://example.org",
    enabled: 1,
    notes: "",
    created_at: 0,
  };
  expect(
    validateResearch(
      { candidates: [candidate()] },
      [candidate().sourceUrl],
      testZone,
      [source],
    ),
  ).toHaveLength(1);
  expect(() =>
    validateResearch({ candidates: [candidate()] }, [], testZone, [source]),
  ).toThrow("sources consultées");
  expect(() =>
    validateResearch(
      { candidates: [candidate({ sourceUrl: "https://evil.example/e" })] },
      ["https://evil.example/e"],
      testZone,
      [source],
    ),
  ).toThrow();
});
it("refuse les protocoles actifs et adresses locales", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.org",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost/a",
    "https://u:p@example.org",
  ])
    expect(safeSourceUrl(url)).toBe(false);
});
it("borne le temps d’un fournisseur qui ignore son signal", async () => {
  await expect(
    withDeadline(new Promise(() => {}), AbortSignal.timeout(20)),
  ).rejects.toThrow("Délai");
});
