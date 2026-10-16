import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { query } from "./db";
import { type Newsletter } from "./domain";
import { enqueue, getNewsletter, listSources } from "./store";
import { getZone, listZones } from "./zones";
import { type DiscoveryProvider } from "./providers";
import { buildEdition } from "./pipeline";
import { withDeadline } from "./deadline";
import { OpenAIDiscovery } from "./openai-discovery";
import { referenceNow } from "./clock";

type Job = { id: string; newsletter_id: string; attempt: number };
export async function processOne(provider?: DiscoveryProvider) {
  const now = Date.now();
  const maxAttempts = Math.max(
    1,
    Math.min(Number(process.env.PREPARATION_MAX_ATTEMPTS) || 3, 5),
  );
  await query(
    "UPDATE zone_newsletters SET preparation_status='failed',error='Worker interrompu : reprises épuisées' WHERE id IN (SELECT newsletter_id FROM newsletter_jobs WHERE status='processing' AND locked_until<$1 AND attempt>=$2)",
    [now, maxAttempts],
  );
  await query(
    "UPDATE newsletter_jobs SET status=CASE WHEN attempt>=$2 THEN 'failed' ELSE 'queued' END,lease=NULL,error='Bail expiré' WHERE status='processing' AND locked_until<$1",
    [now, maxAttempts],
  );
  const lease = randomUUID();
  const job = (
    await query<Job>(
      "UPDATE newsletter_jobs SET status='processing',attempt=attempt+1,lease=$1,locked_until=$2 WHERE id=(SELECT id FROM newsletter_jobs WHERE status='queued' AND run_after<=$3 ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *",
      [lease, now + 120_000, now],
    )
  )[0];
  if (!job) return false;
  const started = Date.now();
  try {
    const edition = await getNewsletter(job.newsletter_id);
    if (!edition) return true;
    const zone = await getZone(edition.zone);

    const timeout = Math.max(
      1000,
      Math.min(Number(process.env.PREPARATION_TIMEOUT_MS) || 45000, 90_000),
    );
    const signal = AbortSignal.timeout(timeout);
    await query(
      "UPDATE zone_newsletters SET preparation_status='processing',updated_at=$1 WHERE id=$2",
      [now, edition.id],
    );
    const sources = (await listSources(zone.id)).filter((s) => s.enabled === 1);
    const weekend = {
      key: edition.weekend,
      saturday: edition.weekend,
      sunday: DateTime.fromISO(edition.weekend).plus({ days: 1 }).toISODate()!,
      timezone: zone.timezone,
    };
    const discovery = provider || new OpenAIDiscovery();
    const candidates = await withDeadline(
      discovery.discover(zone, weekend, sources, signal),
      signal,
    );
    const content = buildEdition(zone, weekend, candidates, referenceNow());
    content.metrics.durationMs = Date.now() - started;
    if (discovery instanceof OpenAIDiscovery) {
      content.metrics.tokens = discovery.tokens;
      content.research = {
        responseId: discovery.responseId,
        sources: discovery.consulted,
        toolCalls: discovery.toolCalls,
      };
    }
    const changed = await query(
      "UPDATE zone_newsletters SET preparation_status='ready',content=$1,error=NULL,updated_at=$2 WHERE id=$3 AND content IS NULL AND EXISTS(SELECT 1 FROM newsletter_jobs WHERE id=$4 AND lease=$5 AND status='processing' AND locked_until>$2) RETURNING id",
      [JSON.stringify(content), Date.now(), edition.id, job.id, lease],
    );
    if (changed.length) {
      await query(
        "UPDATE newsletter_jobs SET status='completed',lease=NULL,error=NULL WHERE id=$1 AND lease=$2",
        [job.id, lease],
      );
      await query(
        "INSERT INTO newsletter_attempts(id,job_id,attempt,state,created_at) VALUES($1,$2,$3,'completed',$4)",
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
      /non configurée|pas encore ouverte/.test(message);
    const changed = await query(
      "UPDATE newsletter_jobs SET status=$1,error=$2,run_after=$3,lease=NULL WHERE id=$4 AND lease=$5 RETURNING id",
      [
        terminal ? "failed" : "queued",
        message,
        Date.now() + 1000 * 2 ** job.attempt,
        job.id,
        lease,
      ],
    );
    if (changed.length) {
      await query(
        "UPDATE zone_newsletters SET preparation_status=$1,error=$2,updated_at=$3 WHERE id=$4",
        [
          terminal ? "failed" : "queued",
          message,
          Date.now(),
          job.newsletter_id,
        ],
      );
      await query(
        "INSERT INTO newsletter_attempts(id,job_id,attempt,state,error,created_at) VALUES($1,$2,$3,'failed',$4,$5)",
        [randomUUID(), job.id, job.attempt, message, Date.now()],
      );
    }
  }
  return true;
}
export async function schedule(now = new Date()) {
  let count = 0;
  for (const zone of await listZones()) {
    const local = DateTime.fromJSDate(now, { zone: zone.timezone });
    // Prepare the preceding day, leaving room for human review. Also catch up on send day.
    const precedingDay = zone.send_day === 1 ? 7 : zone.send_day - 1;
    if (
      (local.weekday === precedingDay && local.hour >= 8) ||
      local.weekday === zone.send_day
    ) {
      const target =
        local.weekday === 7 && zone.send_day === 1
          ? local.plus({ days: 1 }).toJSDate()
          : now;
      await enqueue(zone.id, target);
      count++;
    }
  }
  return count;
}
