import { DateTime } from "luxon";
import { query } from "./db";
import { getNewsletter } from "./store";
import { getZone } from "./zones";
import { type Newsletter, type Subscriber } from "./domain";
import {
  mailReadiness,
  ResendTransport,
  requireRecipient,
  type MailTransport,
} from "./mail-transport";
import { sendDelivery } from "./delivery";

// Dispatch intent is committed before any external call. Recipient eligibility is
// frozen by this timestamp, so later subscribers never enter a resumed edition.
export async function queueBroadcast(id: string) {
  const edition = await getNewsletter(id);
  if (
    !edition?.content ||
    edition.preparation_status !== "approved" ||
    edition.revision !== edition.approved_revision
  )
    throw new Error("Approbation requise");
  const zone = await getZone(edition.zone);
  if (
    Date.now() >=
    DateTime.fromISO(edition.weekend, { zone: zone.timezone }).toMillis()
  )
    throw new Error(
      "Édition périmée pour la diffusion : aucun envoi après le début du week-end.",
    );
  if (
    (
      await query(
        "SELECT id FROM newsletter_deliveries WHERE newsletter_id=$1 AND state='sending' LIMIT 1",
        [id],
      )
    ).length
  )
    throw new Error(
      "Envoi ambigu : vérifier les livraisons chez le fournisseur avant toute reprise.",
    );
  const startedAt = Number(edition.dispatch_started_at || Date.now());
  const subscribers = await query<Subscriber>(
    "SELECT * FROM subscribers WHERE zone=$1 AND confirmed_at IS NOT NULL AND confirmed_at<=$2 AND created_at<=$2 AND unsubscribed_at IS NULL",
    [edition.zone, startedAt],
  );
  if (!subscribers.length)
    throw new Error("Aucun abonné confirmé dans cette zone");
  for (const s of subscribers) requireRecipient(s.email);
  const changed = await query(
    "UPDATE zone_newsletters SET send_status='sending',dispatch_started_at=COALESCE(dispatch_started_at,$1),error=NULL,updated_at=$1 WHERE id=$2 AND revision=$3 AND approved_revision=$3 AND preparation_status='approved' AND send_status IN ('not_scheduled','scheduled','blocked','failed') RETURNING id",
    [startedAt, id, edition.revision],
  );
  if (!changed.length) throw new Error("Diffusion déjà en cours ou terminée");
  await query(
    "UPDATE newsletter_deliveries SET state='queued',error=NULL WHERE newsletter_id=$1 AND state='failed' AND (first_attempt_at IS NULL OR first_attempt_at>$2)",
    [id, Date.now() - 23 * 3600_000],
  );
  return { queued: true };
}

export async function queueDue(now = Date.now(), deadline = Infinity) {
  const due = await query<Newsletter>(
    "SELECT * FROM zone_newsletters WHERE send_status='scheduled' AND scheduled_at<=$1 ORDER BY scheduled_at LIMIT 20",
    [now],
  );
  for (const edition of due) {
    if (Date.now() + 40000 >= deadline) break;
    const readiness = mailReadiness();
    try {
      if (!Object.values(readiness).every(Boolean))
        throw new Error(
          "Échéance atteinte : configurer et activer le fournisseur email pour envoyer.",
        );
      await queueBroadcast(edition.id);
    } catch (e) {
      await query(
        "UPDATE zone_newsletters SET send_status='blocked',error=$1 WHERE id=$2 AND send_status='scheduled'",
        [e instanceof Error ? e.message : "Envoi bloqué", edition.id],
      );
    }
  }
}

// Called under the shared runner lease. In-progress deliveries from an interrupted
// call are never retried blindly: their provider outcome must be reconciled first.
export async function processDeliveryBatch({
  deadline,
  limit = 50,
  transport,
  ownsLease = async () => true,
}: {
  deadline: number;
  limit?: number;
  transport?: MailTransport;
  ownsLease?: () => Promise<boolean>;
}) {
  limit = Math.min(50, Math.max(0, limit));
  const batchTransport = transport ?? new ResendTransport();
  let sent = 0;
  let attempted = 0;
  const editions = await query<Newsletter>(
    "SELECT * FROM zone_newsletters WHERE send_status='sending' ORDER BY updated_at LIMIT 20",
  );
  for (const edition of editions) {
    if (
      Date.now() + 40000 >= deadline ||
      attempted >= limit ||
      !(await ownsLease())
    )
      break;
    try {
      const zone = await getZone(edition.zone);
      if (
        Date.now() >=
        DateTime.fromISO(edition.weekend, { zone: zone.timezone }).toMillis()
      )
        throw new Error("Édition périmée pour la diffusion");
      if (!Object.values(mailReadiness()).every(Boolean))
        throw new Error(
          "Diffusion suspendue : fournisseur email désactivé ou incomplet",
        );
      if (!edition.dispatch_started_at)
        throw new Error(
          "Ancienne diffusion interrompue : vérifier les envois avant reprise",
        );
      await query(
        "INSERT INTO newsletter_deliveries(id,newsletter_id,subscriber_id,revision,state,updated_at) SELECT $1 || ':' || s.id,$1,s.id,$2,'queued',$3 FROM subscribers s WHERE s.zone=$4 AND s.confirmed_at IS NOT NULL AND s.confirmed_at<=$5 AND s.created_at<=$5 AND s.unsubscribed_at IS NULL ON CONFLICT(newsletter_id,subscriber_id) DO NOTHING",
        [
          edition.id,
          edition.revision,
          Date.now(),
          edition.zone,
          edition.dispatch_started_at,
        ],
      );
      const pending = await query<{ id: string; subscriber_id: string }>(
        "SELECT id,subscriber_id FROM newsletter_deliveries WHERE newsletter_id=$1 AND state='queued' ORDER BY id LIMIT $2",
        [edition.id, limit - attempted],
      );
      for (const delivery of pending) {
        if (Date.now() + 40000 >= deadline || !(await ownsLease())) break;
        const current = (
          await query<Subscriber>("SELECT * FROM subscribers WHERE id=$1", [
            delivery.subscriber_id,
          ])
        )[0];
        if (
          !current?.confirmed_at ||
          current.unsubscribed_at ||
          current.zone !== edition.zone
        ) {
          await query(
            "UPDATE newsletter_deliveries SET state='skipped',error='Abonnement non éligible',updated_at=$1 WHERE id=$2 AND state='queued'",
            [Date.now(), delivery.id],
          );
          attempted++;
          continue;
        }
        requireRecipient(current.email); // Re-check test allowlist immediately before this batch's external calls.
        attempted++;
        try {
          if (
            (await sendDelivery(
              edition.id,
              delivery.subscriber_id,
              batchTransport,
            )) === "sent"
          )
            sent++;
        } catch {
          await query(
            "UPDATE newsletter_deliveries SET state='failed',error='Livraison interrompue avant envoi',updated_at=$1 WHERE id=$2 AND state='queued'",
            [Date.now(), delivery.id],
          );
        }
      }
      if (!(await ownsLease())) return { sent, attempted };
      const remaining = await query<{ state: string }>(
        "SELECT state FROM newsletter_deliveries WHERE newsletter_id=$1 AND state NOT IN ('sent','skipped')",
        [edition.id],
      );
      if (!remaining.some((r) => r.state === "queued")) {
        const ambiguous = remaining.some((r) => r.state === "sending");
        await query(
          "UPDATE zone_newsletters SET send_status=$1,error=$2,updated_at=$3 WHERE id=$4 AND send_status='sending'",
          [
            remaining.length ? "failed" : "sent",
            ambiguous
              ? "Envoi ambigu : rapprocher le résultat auprès du fournisseur avant reprise."
              : remaining.length
                ? "Certaines livraisons ont échoué. Reprise explicite possible dans les 23 heures suivant leur première tentative."
                : null,
            Date.now(),
            edition.id,
          ],
        );
      }
    } catch (e) {
      await query(
        "UPDATE zone_newsletters SET send_status='failed',error=$1,updated_at=$2 WHERE id=$3 AND send_status='sending'",
        [
          e instanceof Error ? e.message : "Diffusion interrompue",
          Date.now(),
          edition.id,
        ],
      );
    }
  }
  return { sent, attempted };
}
