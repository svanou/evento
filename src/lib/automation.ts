import { randomUUID } from "node:crypto";
import { query } from "./db";
import { processOne, schedule } from "./jobs";
import { queueDue, processDeliveryBatch } from "./dispatch";
import { type DiscoveryProvider } from "./providers";
import { type MailTransport } from "./mail-transport";

export type AutomationState = {
  locked_until: number | null;
  last_started_at: number | null;
  last_finished_at: number | null;
  last_source: string | null;
  last_error: string | null;
  prepared: number;
  delivered: number;
};
export async function automationStatus() {
  let state: AutomationState | undefined;
  try {
    state = (
      await query<AutomationState>(
        "SELECT locked_until,last_started_at,last_finished_at,last_source,last_error,prepared,delivered FROM automation_state WHERE id='runner'",
      )
    )[0];
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
    return {
      migrationRequired: true,
      running: false,
      pendingPreparations: 0,
      pendingDispatches: 0,
      cronConfigured: false,
      schedulingEnabled: false,
    };
  }
  const pending = (
    await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM newsletter_jobs WHERE status IN ('queued','processing')",
    )
  )[0];
  const dispatches = (
    await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM zone_newsletters WHERE send_status='sending'",
    )
  )[0];
  return {
    ...state,
    pendingPreparations: Number(pending.count),
    pendingDispatches: Number(dispatches.count),
    running: Number(state?.locked_until || 0) > Date.now(),
    cronConfigured: (process.env.CRON_SECRET || "").length >= 32,
    schedulingEnabled: process.env.SCHEDULER_ENABLED === "true",
  };
}

export async function runAutomation({
  source,
  newsletterId,
  provider,
  transport,
  budgetMs = 220000,
  deliveryLimit = 50,
}: {
  source: "cron" | "admin" | "worker";
  newsletterId?: string;
  provider?: DiscoveryProvider;
  transport?: MailTransport;
  budgetMs?: number;
  deliveryLimit?: number;
}) {
  const started = Date.now();
  const deadline = started + Math.min(Math.max(budgetMs, 0), 220000);
  const lease = randomUUID();
  const claimed = await query(
    "UPDATE automation_state SET lease=$1,locked_until=$2,last_started_at=$3,last_source=$4,last_error=NULL WHERE id='runner' AND (lease IS NULL OR locked_until<$3) RETURNING id",
    [lease, started + 300000, started, source],
  );
  if (!claimed.length) return { busy: true, prepared: 0, delivered: 0 };
  const ownsLease = async () =>
    !!(
      await query(
        "SELECT id FROM automation_state WHERE id='runner' AND lease=$1 AND locked_until>$2",
        [lease, Date.now()],
      )
    ).length;
  let prepared = 0;
  let delivered = 0;
  try {
    if (process.env.SCHEDULER_ENABLED === "true")
      await schedule(new Date(), Math.min(deadline, Date.now() + 15000));
    await queueDue(Date.now(), deadline);
    if (Date.now() + 180000 < deadline && (await ownsLease()))
      prepared = (await processOne(provider, newsletterId)) ? 1 : 0;
    if (Date.now() + 40000 < deadline && (await ownsLease()))
      delivered = (
        await processDeliveryBatch({
          deadline,
          limit: deliveryLimit,
          transport,
          ownsLease,
        })
      ).sent;
    return { busy: false, prepared, delivered };
  } catch (e) {
    // Never persist raw connection strings or provider errors in a status exposed to the admin.
    await query(
      "UPDATE automation_state SET last_error='Traitement interrompu : vérifier la configuration, les migrations et les tentatives.' WHERE id='runner' AND lease=$1",
      [lease],
    );
    throw e;
  } finally {
    await query(
      "UPDATE automation_state SET lease=NULL,locked_until=NULL,last_finished_at=$1,prepared=$2,delivered=$3 WHERE id='runner' AND lease=$4",
      [Date.now(), prepared, delivered, lease],
    );
  }
}
