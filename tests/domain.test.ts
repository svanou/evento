import { describe, it, expect } from "vitest";
import {
  weekendFor,
  fridayDue,
  safeSourceUrl,
  zoneFor,
} from "../src/lib/domain";
import { selectCandidates } from "../src/lib/pipeline";
import { DemoRouting } from "../src/lib/providers";
import { renderEmail } from "../src/lib/email";
import { candidates, profile, now } from "./fixtures";

describe("Dates locales du week-end", () => {
  it("utilise le samedi à venir, conserve le week-end en cours et passe l’année", () => {
    expect(weekendFor(now, "Europe/Paris").key).toBe("2026-10-10");
    expect(
      weekendFor(new Date("2026-10-11T12:00:00Z"), "Europe/Paris").key,
    ).toBe("2026-10-10");
    expect(
      weekendFor(new Date("2026-12-31T12:00:00Z"), "Europe/Paris").key,
    ).toBe("2027-01-02");
  });
  it("respecte les fuseaux proches de la ligne de changement de date et l’heure d’été", () => {
    const t = new Date("2026-10-11T22:30:00Z");
    expect(weekendFor(t, "Pacific/Kiritimati").key).toBe("2026-10-17");
    expect(weekendFor(t, "America/Los_Angeles").key).toBe("2026-10-10");
    expect(fridayDue(new Date("2026-03-27T07:00:00Z"), "Europe/Paris")).toBe(
      true,
    );
    expect(fridayDue(new Date("2026-04-03T06:00:00Z"), "Europe/Paris")).toBe(
      true,
    );
    expect(fridayDue(new Date("2026-04-03T05:59:00Z"), "Europe/Paris")).toBe(
      false,
    );
  });
  it("ne promet pas de couverture hors zone", () => {
    expect(zoneFor("Genève", "CH")).toBe("gex-geneva");
    expect(zoneFor("Genève", "FR")).toBe("waiting");
    expect(zoneFor("Tokyo", "FR")).toBe("waiting");
  });
});

describe("Sélection et incertitudes", () => {
  async function run(
    overrides: Partial<Parameters<typeof selectCandidates>[0]> = {},
  ) {
    return selectCandidates({
      profile: profile(),
      candidates: await candidates(),
      weekend: weekendFor(now, "Europe/Paris"),
      routing: new DemoRouting(),
      demo: true,
      now,
      ...overrides,
    });
  }
  it("limite à cinq, écarte les doublons, les dates passées et les contradictions", async () => {
    const result = await run();
    expect(
      result.items.filter((i) => i.decision === "selected").length,
    ).toBeGreaterThan(0);
    expect(
      result.items.filter((i) => i.decision === "selected").length,
    ).toBeLessThanOrEqual(5);
    for (const id of ["forest-duplicate", "old", "conflict"])
      expect(result.items.find((i) => i.candidate.id === id)?.decision).toBe(
        "rejected",
      );
    expect(result.metrics.measuredCost).toBeNull();
  });
  it("respecte le budget total, la frontière, les âges et les disponibilités", async () => {
    const result = await run({
      profile: profile({
        budget: 0,
        crossBorder: false,
        childrenAges: [2],
        availability: ["sun-pm"],
      }),
    });
    const main = result.items.filter((i) => i.decision === "selected");
    expect(
      main.every((i) => i.candidate.country === "FR" && i.totalPrice === 0),
    ).toBe(true);
    expect(
      result.items.find((i) => i.candidate.id === "forest")?.decision,
    ).toBe("rejected");
    expect(
      result.items.find((i) => i.candidate.id === "clay")?.reasons,
    ).toContain("Budget total dépassé");
  });
  it("ne transforme jamais un trajet inconnu ou simulé en conformité réelle", async () => {
    const result = await run();
    expect(
      result.items.find((i) => i.candidate.id === "unknown-route")?.decision,
    ).toBe("alternative");
    expect(result.items.every((i) => i.constraintStatus !== "verified")).toBe(
      true,
    );
    const list = (await candidates()).map((c) => ({
      ...c,
      fictitious: false,
      evidence: c.evidence.map((e) => ({ ...e, fictitious: false })),
    }));
    const live = await run({ candidates: list, demo: false });
    expect(live.items.filter((i) => i.decision === "selected")).toHaveLength(0);
  });
  it("conserve les tarifs et l’accessibilité inconnus parmi les alternatives", async () => {
    const result = await run({ profile: profile({ accessible: true }) });
    const lake = result.items.find((i) => i.candidate.id === "lake")!;
    expect(lake.decision).toBe("alternative");
    expect(lake.totalPrice).toBeNull();
    expect(lake.reasons).toContain("Accessibilité non confirmée");
    expect(lake.reasons).toContain("Tarif non renseigné : budget invérifiable");
  });
  it("rejette une année de preuve erronée, une récurrence non confirmée et les dépassements de trajet", async () => {
    const list = await candidates();
    list[0].evidence[0].year = 2025;
    list[1].recurringConfirmed = false;
    const result = await run({
      candidates: list,
      profile: profile({ transport: [{ mode: "walk", maxMinutes: 5 }] }),
    });
    expect(
      result.items.find((i) => i.candidate.id === "forest")?.reasons,
    ).toContain("Année de la source différente de l’événement");
    expect(result.items.find((i) => i.candidate.id === "clay")?.decision).toBe(
      "alternative",
    );
    expect(result.items.filter((i) => i.decision === "selected")).toHaveLength(
      0,
    );
  });
  it("respecte la limite d’appels et n’invente pas de durée lorsque le budget est épuisé", async () => {
    const result = await run({ maxCalls: 1 });
    expect(result.metrics.calls).toBe(1);
    expect(result.items.filter((i) => i.decision === "selected")).toHaveLength(
      1,
    );
    expect(
      result.items
        .filter((i) => i.decision === "alternative")
        .every((i) => i.route === null || i.route.minutes === null),
    ).toBe(true);
  });
  it("interrompt un fournisseur bloqué même s’il ignore le signal", async () => {
    await expect(
      run({
        routing: { route: async () => new Promise(() => {}) },
        signal: AbortSignal.timeout(30),
      }),
    ).rejects.toThrow("Délai");
  });
  it("échappe les contenus non fiables et conserve les citations dans les deux formats", async () => {
    const result = await run();
    result.items[0].candidate.title = '<script>alert("x")</script>';
    const email = renderEmail(profile(), result, {
      manage: "https://example.org/manage",
      unsubscribe: "https://example.org/unsubscribe",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("https://example.org/demo/");
    expect(email.text).toContain("DÉMONSTRATION");
    expect(email.text).toContain("SIMULATION");
  });
  it("interdit les protocoles actifs et destinations réseau locales dans les citations", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.org",
      "https://127.0.0.1",
      "https://2130706433",
      "https://[::1]",
      "https://localhost/x",
      "https://u:p@example.org",
      "https://example.org:8443",
    ])
      expect(safeSourceUrl(url)).toBe(false);
    expect(safeSourceUrl("https://www.gex.fr/agenda")).toBe(true);
  });
});
