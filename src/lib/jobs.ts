import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { query } from "./db";
import {
  type Candidate,
  type Edition,
  type Profile,
  type Selection,
  fridayDue,
  weekendFor,
} from "./domain";
import { demo } from "./security";
import { enqueue, getProfile } from "./store";
import {
  DemoDiscovery,
  DemoRouting,
  type DiscoveryProvider,
  type RoutingProvider,
} from "./providers";
import { candidateFingerprint, selectCandidates } from "./pipeline";
import { withDeadline } from "./deadline";
import { referenceNow } from "./clock";

type Job = {
  id: string;
  edition_id: string;
  attempt: number;
  lease: string;
  locked_until: number;
};
export async function processOne(providers?: {
  discovery: DiscoveryProvider;
  routing: RoutingProvider;
}) {
  const now = Date.now();
  const maxAttempts = Math.max(
    1,
    Math.min(Number(process.env.PREPARATION_MAX_ATTEMPTS) || 3, 5),
  );
  await query(
    "UPDATE editions SET status='failed',error='Worker interrompu : reprises épuisées' WHERE id IN (SELECT edition_id FROM jobs WHERE status='processing' AND locked_until<$1 AND attempt>=$2)",
    [now, maxAttempts],
  );
  await query(
    "UPDATE jobs SET status=CASE WHEN attempt>=$2 THEN 'failed' ELSE 'queued' END,lease=NULL,error='Bail expiré : worker interrompu' WHERE status='processing' AND locked_until<$1",
    [now, maxAttempts],
  );
  const lease = randomUUID();
  const jobs = await query<Job>(
    `UPDATE jobs SET status='processing',attempt=attempt+1,lease=$1,locked_until=$2
    WHERE id=(SELECT id FROM jobs WHERE status='queued' AND run_after<=$3 ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`,
    [lease, now + 120_000, now],
  );
  const job = jobs[0];
  if (!job) return false;
  const edition = (
    await query<Edition>("SELECT * FROM editions WHERE id=$1", [job.edition_id])
  )[0];
  if (!edition) return true;
  const start = Date.now();
  try {
    const profile = await getProfile(edition.profile_id);
    if (
      !profile ||
      profile.unsubscribedAt ||
      profile.revision !== edition.revision
    )
      throw new Error("Profil désinscrit ou préférences modifiées");
    if (!demo() && !providers)
      throw new Error(
        "Recherche réelle non configurée. Cette tranche fournit uniquement la démonstration.",
      );
    const started = await query(
      "UPDATE editions SET status='processing',updated_at=$1 WHERE id=$2 AND EXISTS(SELECT 1 FROM jobs WHERE id=$3 AND lease=$4 AND status='processing') RETURNING id",
      [now, edition.id, job.id, lease],
    );
    if (!started.length) return true;
    const deadline = Math.max(
      1000,
      Math.min(Number(process.env.PREPARATION_TIMEOUT_MS) || 45000, 90_000),
    );
    const signal = AbortSignal.timeout(deadline);
    const weekend = {
      key: edition.weekend,
      saturday: edition.weekend,
      sunday: DateTime.fromISO(edition.weekend).plus({ days: 1 }).toISODate()!,
      timezone: profile.timezone,
    };
    // Cache keys contain only zone/period/provider. Never put a profile into shared cache.
    const key = `${demo() ? "demo-v1" : "live-v1"}:${profile.zone}:${weekend.key}:${demo() ? process.env.DEMO_REFERENCE_DATE || "current" : ""}`;
    const cached = (
      await query<{ data: string }>(
        "SELECT data FROM cache WHERE key=$1 AND expires_at>$2",
        [key, now],
      )
    )[0];
    const discovery = providers?.discovery || new DemoDiscovery();
    const routing = providers?.routing || new DemoRouting();
    const candidates: Candidate[] = cached
      ? JSON.parse(cached.data)
      : await withDeadline(
          discovery.discover(profile.zone, weekend, signal),
          signal,
        );
    if (!cached)
      await query(
        "INSERT INTO cache(key,data,expires_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET data=$2,expires_at=$3",
        [key, JSON.stringify(candidates), now + 6 * 3600_000],
      );
    const old = await query<{ data: string }>(
      "SELECT data FROM editions WHERE profile_id=$1 AND id<>$2 AND weekend<>$3 AND status='approved' AND data IS NOT NULL",
      [profile.id, edition.id, edition.weekend],
    );
    const seen = new Set<string>();
    for (const row of old)
      for (const item of (JSON.parse(row.data) as Selection).items)
        if (item.decision === "selected")
          seen.add(candidateFingerprint(item.candidate));
    const known = await query<{ candidate_id: string }>(
      "SELECT candidate_id FROM feedback WHERE profile_id=$1 AND kind='known'",
      [profile.id],
    );
    for (const candidate of candidates)
      if (known.some((k) => k.candidate_id === candidate.id))
        seen.add(candidateFingerprint(candidate));
    const selection = await selectCandidates({
      profile,
      candidates,
      weekend,
      routing,
      demo: demo(),
      alreadySeen: seen,
      now: referenceNow(),
      maxCalls: Math.max(
        0,
        (Number(process.env.PREPARATION_MAX_CALLS) || 8) - (cached ? 0 : 1),
      ),
      signal,
    });
    selection.metrics.calls += cached ? 0 : 1;
    selection.metrics.durationMs = Date.now() - start;
    const done = await query(
      "UPDATE editions SET status='ready',data=$1,error=NULL,updated_at=$2 WHERE id=$3 AND EXISTS(SELECT 1 FROM jobs WHERE id=$4 AND lease=$5 AND status='processing' AND locked_until>$2) RETURNING id",
      [JSON.stringify(selection), Date.now(), edition.id, job.id, lease],
    );
    if (done.length) {
      for (const item of selection.items)
        await query(
          "INSERT INTO candidates(id,edition_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=$3",
          [
            `${edition.id}:${item.candidate.id}`,
            edition.id,
            JSON.stringify(item),
          ],
        );
      await query(
        "UPDATE jobs SET status='completed',lease=NULL,error=NULL WHERE id=$1 AND lease=$2",
        [job.id, lease],
      );
      await query(
        "INSERT INTO job_attempts(id,job_id,attempt,state,created_at) VALUES($1,$2,$3,'completed',$4)",
        [randomUUID(), job.id, job.attempt, Date.now()],
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Erreur de préparation";
    const terminal =
      job.attempt >= maxAttempts ||
      /Profil désinscrit|non configurée/.test(message);
    const owned = await query(
      "UPDATE jobs SET status=$1,error=$2,run_after=$3,lease=NULL WHERE id=$4 AND lease=$5 RETURNING id",
      [
        terminal ? "failed" : "queued",
        message,
        Date.now() + 1000 * 2 ** job.attempt,
        job.id,
        lease,
      ],
    );
    if (owned.length) {
      await query(
        "UPDATE editions SET status=$1,error=$2,updated_at=$3 WHERE id=$4",
        [terminal ? "failed" : "queued", message, Date.now(), edition.id],
      );
      await query(
        "INSERT INTO job_attempts(id,job_id,attempt,state,error,created_at) VALUES($1,$2,$3,'failed',$4,$5)",
        [randomUUID(), job.id, job.attempt, message, Date.now()],
      );
    }
  }
  return true;
}

export async function schedule(now = new Date()) {
  const rows = await query<{ data: string }>("SELECT data FROM profiles");
  let count = 0;
  for (const row of rows) {
    const p = JSON.parse(row.data) as Profile;
    if (
      p.confirmedAt &&
      !p.unsubscribedAt &&
      p.zone !== "waiting" &&
      fridayDue(now, p.timezone) &&
      (p.subscription === "active" ||
        (p.subscription === "trial" && p.trialUsed < 4))
    ) {
      if (await enqueue(p.id, now)) count++;
    }
  }
  return count;
}
