import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query, closeDb } from "../src/lib/db";
import {
  createProfile,
  enqueue,
  editionsFor,
  getProfile,
  mutateProfile,
  unsubscribe,
  deleteProfile,
  approveEdition,
} from "../src/lib/store";
import { processOne, schedule } from "../src/lib/jobs";
import { tokenOwner, newToken } from "../src/lib/security";
import { sendTestEdition } from "../src/lib/delivery";
import { type Selection } from "../src/lib/domain";
import {
  DemoDiscovery,
  DemoRouting,
  type EmailProvider,
} from "../src/lib/providers";
import { preferences } from "./fixtures";
const directory = mkdtempSync(join(tmpdir(), "evento-tests-"));
beforeAll(() => {
  process.env.DATA_DIR = directory;
  process.env.APP_MODE = "demo";
  process.env.DEMO_REFERENCE_DATE = "2026-10-09T06:00:00Z";
  delete process.env.DATABASE_URL;
});
afterAll(async () => {
  await closeDb();
  rmSync(directory, { recursive: true, force: true });
});

describe("Parcours persistant", () => {
  it("enregistre le profil, protège les sessions, prépare et approuve une sélection", async () => {
    const created = await createProfile(preferences());
    expect((await getProfile(created.profile.id))?.email).toBe(
      created.profile.email,
    );
    expect(await tokenOwner(created.session, "session")).toBe(
      created.profile.id,
    );
    expect(await tokenOwner(created.confirm, "session")).toBeNull();
    expect(await tokenOwner(created.confirm, "confirm", true)).toBe(
      created.profile.id,
    );
    expect(await tokenOwner(created.confirm, "confirm", true)).toBeNull();
    const first = await enqueue(created.profile.id);
    const second = await enqueue(created.profile.id);
    expect(first?.id).toBe(second?.id);
    await Promise.all([processOne(), processOne()]);
    const edition = (await editionsFor(created.profile.id))[0];
    expect(edition.status).toBe("ready");
    const selection = JSON.parse(edition.data!) as Selection;
    expect(selection.items.some((i) => i.decision === "selected")).toBe(true);
    expect(
      await query(
        "SELECT * FROM jobs WHERE edition_id=$1 AND status='completed'",
        [edition.id],
      ),
    ).toHaveLength(1);
    await expect(approveEdition(edition.id, ["unknown-route"])).rejects.toThrow(
      "conformes",
    );
    await approveEdition(
      edition.id,
      selection.items
        .filter((i) => i.decision === "selected")
        .map((i) => i.candidate.id),
    );
    expect((await editionsFor(created.profile.id))[0].status).toBe("approved");
  });
  it("reprend après l’échec d’un fournisseur sans perdre l’édition", async () => {
    await query("DELETE FROM cache");
    const created = await createProfile(preferences());
    const fail = {
      discover: async () => {
        throw new Error("Fournisseur temporairement indisponible");
      },
    };
    await processOne({ discovery: fail, routing: new DemoRouting() });
    expect((await editionsFor(created.profile.id))[0].status).toBe("queued");
    await query("UPDATE jobs SET run_after=0 WHERE edition_id=$1", [
      (await editionsFor(created.profile.id))[0].id,
    ]);
    await processOne({
      discovery: new DemoDiscovery(),
      routing: new DemoRouting(),
    });
    const edition = (await editionsFor(created.profile.id))[0];
    expect(edition.status).toBe("ready");
    expect(
      await query(
        "SELECT * FROM job_attempts WHERE job_id IN (SELECT id FROM jobs WHERE edition_id=$1)",
        [edition.id],
      ),
    ).toHaveLength(2);
  });
  it("bloque l’envoi sans activation, confirmation, liste autorisée et approbation ; déduplique les envois", async () => {
    const created = await createProfile(preferences());
    await processOne();
    const edition = (await editionsFor(created.profile.id))[0];
    const selection = JSON.parse(edition.data!) as Selection;
    let calls = 0;
    const provider: EmailProvider = {
      send: async () => {
        calls++;
        return { id: "fake-provider-id" };
      },
    };
    const config = { mode: "test", allowlist: [created.profile.email] };
    await expect(
      sendTestEdition(edition.id, provider, { ...config, mode: "disabled" }),
    ).rejects.toThrow("désactivés");
    await expect(sendTestEdition(edition.id, provider, config)).rejects.toThrow(
      "Approbation",
    );
    await approveEdition(
      edition.id,
      selection.items
        .filter((i) => i.decision === "selected")
        .map((i) => i.candidate.id),
    );
    await expect(sendTestEdition(edition.id, provider, config)).rejects.toThrow(
      "non confirmé",
    );
    await mutateProfile(created.profile.id, (p) => ({
      ...p,
      confirmedAt: Date.now(),
    }));
    await expect(
      sendTestEdition(edition.id, provider, { ...config, allowlist: [] }),
    ).rejects.toThrow("liste");
    const results = await Promise.all([
      sendTestEdition(edition.id, provider, config),
      sendTestEdition(edition.id, provider, config),
    ]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "sent"]);
    expect((await getProfile(created.profile.id))?.trialUsed).toBe(0);
  });
  it("reprend un envoi échoué avec la même clé d’idempotence", async () => {
    const created = await createProfile(preferences());
    await processOne();
    const edition = (await editionsFor(created.profile.id))[0];
    const selection = JSON.parse(edition.data!) as Selection;
    await approveEdition(
      edition.id,
      selection.items
        .filter((i) => i.decision === "selected")
        .map((i) => i.candidate.id),
    );
    await mutateProfile(created.profile.id, (p) => ({
      ...p,
      confirmedAt: Date.now(),
    }));
    const keys: string[] = [];
    const payloads: string[] = [];
    const config = { mode: "test", allowlist: [created.profile.email] };
    await expect(
      sendTestEdition(
        edition.id,
        {
          send: async (input) => {
            keys.push(input.idempotencyKey);
            payloads.push(input.html);
            throw new Error("timeout fournisseur");
          },
        },
        config,
      ),
    ).rejects.toThrow("timeout");
    await sendTestEdition(
      edition.id,
      {
        send: async (input) => {
          keys.push(input.idempotencyKey);
          payloads.push(input.html);
          return { id: "test" };
        },
      },
      config,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(payloads[0]).toBe(payloads[1]);
  });
  it("désinscrit immédiatement et supprime les données liées ainsi que les jetons", async () => {
    const created = await createProfile(preferences());
    await unsubscribe(created.profile.id);
    expect(await enqueue(created.profile.id)).toBeNull();
    expect((await editionsFor(created.profile.id))[0].status).toBe("failed");
    const owner = created.profile.id;
    await deleteProfile(owner);
    expect(await getProfile(owner)).toBeNull();
    expect(await tokenOwner(created.session, "session")).toBeNull();
    expect(await editionsFor(owner)).toHaveLength(0);
    expect(
      await query("SELECT * FROM consents WHERE profile_id=$1", [owner]),
    ).toHaveLength(0);
  });
  it("planifie seulement les profils confirmés, sans double tâche le vendredi local", async () => {
    const created = await createProfile(preferences());
    const before = (await editionsFor(created.profile.id)).length;
    await schedule(new Date("2026-11-06T08:00:00Z"));
    expect((await editionsFor(created.profile.id)).length).toBe(before);
    await mutateProfile(created.profile.id, (p) => ({
      ...p,
      confirmedAt: Date.now(),
    }));
    await schedule(new Date("2026-11-06T08:00:00Z"));
    await schedule(new Date("2026-11-06T09:00:00Z"));
    expect((await editionsFor(created.profile.id)).length).toBe(before + 1);
  });
  it("ne réutilise pas un jeton expiré", async () => {
    const created = await createProfile(preferences());
    const token = await newToken(created.profile.id, "manage", -1000);
    expect(await tokenOwner(token, "manage", true)).toBeNull();
  });
});
