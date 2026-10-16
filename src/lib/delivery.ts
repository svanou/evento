import { randomUUID } from "node:crypto";
import { query } from "./db";
import { type Content, type Subscriber, type Newsletter } from "./domain";
import { getNewsletter, getSubscriber } from "./store";
import { getZone } from "./zones";
import { appUrl, newToken } from "./security";
import { renderEmail, escapeHtml } from "./email";
import {
  ResendTransport,
  requireRecipient,
  type MailTransport,
  mailReadiness,
} from "./mail-transport";

export async function sendConfirmation(
  id: string,
  transport: MailTransport = new ResendTransport(),
) {
  const subscriber = await getSubscriber(id);
  if (!subscriber || subscriber.unsubscribed_at)
    throw new Error("Abonnement introuvable ou désinscrit");
  requireRecipient(subscriber.email);
  const token = await newToken(id, "confirm", 24 * 3600_000);
  const url = `${appUrl()}/lien/confirm#token=${token}`;
  const zone = await getZone(subscriber.zone);
  await transport.send(
    {
      to: subscriber.email,
      subject: `Confirmez votre inscription — Evento ${zone.name}`,
      text: `Confirmez votre inscription gratuite à la newsletter ${zone.name} : ${url}\nSans confirmation, aucun envoi récurrent. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.`,
      html: `<p>Confirmez votre inscription gratuite à la newsletter ${escapeHtml(zone.name)}.</p><p><a href="${escapeHtml(url)}">Confirmer mon inscription</a></p><p>Sans confirmation, aucun envoi récurrent. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`,
    },
    `confirm-${token}`,
  );
}
export async function sendDelivery(
  newsletterId: string,
  subscriberId: string,
  transport: MailTransport = new ResendTransport(),
) {
  const edition = await getNewsletter(newsletterId);
  if (
    !edition?.content ||
    edition.preparation_status !== "approved" ||
    edition.approved_revision !== edition.revision
  )
    throw new Error("Approbation de la dernière version requise");
  const zone = await getZone(edition.zone);
  const subscriber = await getSubscriber(subscriberId);
  if (
    !subscriber ||
    subscriber.zone !== zone.id ||
    !subscriber.confirmed_at ||
    subscriber.unsubscribed_at
  )
    throw new Error("Abonné non confirmé, désinscrit ou dans une autre zone");
  requireRecipient(subscriber.email);
  await query(
    "INSERT INTO newsletter_deliveries(id,newsletter_id,subscriber_id,revision,state,updated_at) SELECT $1,$2,$3,$4,'queued',$5 WHERE EXISTS(SELECT 1 FROM zone_newsletters WHERE id=$2 AND revision=$4 AND approved_revision=$4 AND preparation_status='approved') ON CONFLICT(newsletter_id,subscriber_id) DO NOTHING",
    [randomUUID(), edition.id, subscriber.id, edition.revision, Date.now()],
  );
  const claim = (
    await query<{ id: string; payload: string | null }>(
      "UPDATE newsletter_deliveries SET state='sending',error=NULL,first_attempt_at=COALESCE(first_attempt_at,$1),updated_at=$1 WHERE newsletter_id=$2 AND subscriber_id=$3 AND state IN ('queued','failed') AND (first_attempt_at IS NULL OR first_attempt_at>$4) RETURNING id,payload",
      [Date.now(), edition.id, subscriber.id, Date.now() - 23 * 3600_000],
    )
  )[0];
  if (!claim) return "not_claimed";
  try {
    const current = await getSubscriber(subscriber.id);
    if (!current?.confirmed_at || current.unsubscribed_at)
      throw new Error("Abonné désinscrit");
    let payload: ReturnType<typeof renderEmail>;
    if (claim.payload) payload = JSON.parse(claim.payload);
    else {
      const manage = await newToken(subscriber.id, "manage", 7 * 86400_000);
      const unsubscribe = await newToken(
        subscriber.id,
        "unsubscribe",
        180 * 86400_000,
      );
      payload = renderEmail(zone, JSON.parse(edition.content) as Content, {
        manage: `${appUrl()}/lien/manage#token=${manage}`,
        unsubscribe: `${appUrl()}/lien/unsubscribe#token=${unsubscribe}`,
      });
      await query("UPDATE newsletter_deliveries SET payload=$1 WHERE id=$2", [
        JSON.stringify(payload),
        claim.id,
      ]);
    }
    await transport.send({ to: subscriber.email, ...payload }, claim.id);
    await query(
      "UPDATE newsletter_deliveries SET state='sent',updated_at=$1 WHERE id=$2",
      [Date.now(), claim.id],
    );
    await query(
      "INSERT INTO newsletter_delivery_attempts(id,delivery_id,state,created_at) VALUES($1,$2,'sent',$3)",
      [randomUUID(), claim.id, Date.now()],
    );
    return "sent";
  } catch (e) {
    const error = e instanceof Error ? e.message : "Échec de l’envoi";
    await query(
      "UPDATE newsletter_deliveries SET state='failed',error=$1,updated_at=$2 WHERE id=$3",
      [error, Date.now(), claim.id],
    );
    await query(
      "INSERT INTO newsletter_delivery_attempts(id,delivery_id,state,error,created_at) VALUES($1,$2,'failed',$3,$4)",
      [randomUUID(), claim.id, error, Date.now()],
    );
    throw e;
  }
}
export async function broadcast(id: string) {
  const edition = await getNewsletter(id);
  if (
    !edition ||
    edition.preparation_status !== "approved" ||
    edition.revision !== edition.approved_revision
  )
    throw new Error("Approbation requise");
  await getZone(edition.zone);
  const subscribers = await query<Subscriber>(
    "SELECT * FROM subscribers WHERE zone=$1 AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL",
    [edition.zone],
  );
  if (!subscribers.length)
    throw new Error("Aucun abonné confirmé dans cette zone");
  for (const s of subscribers) requireRecipient(s.email); // Fail closed before any partial dispatch in test mode.
  const claim = await query(
    "UPDATE zone_newsletters SET send_status='sending',updated_at=$1 WHERE id=$2 AND send_status IN ('not_scheduled','scheduled','blocked','failed') AND revision=$3 AND approved_revision=$3 RETURNING id",
    [Date.now(), id, edition.revision],
  );
  if (!claim.length) throw new Error("Diffusion déjà en cours ou terminée");
  let sent = 0;
  let failed = 0;
  for (const s of subscribers) {
    try {
      if ((await sendDelivery(id, s.id)) === "sent") sent++;
    } catch {
      failed++;
    }
  }
  const unresolved = (
    await query(
      "SELECT id FROM newsletter_deliveries WHERE newsletter_id=$1 AND state<>'sent'",
      [id],
    )
  ).length;
  await query(
    "UPDATE zone_newsletters SET send_status=$1,error=$2,updated_at=$3 WHERE id=$4",
    [
      failed || unresolved ? "failed" : "sent",
      failed || unresolved
        ? "Certains envois n’ont pas abouti ; consulter les tentatives avant reprise."
        : null,
      Date.now(),
      id,
    ],
  );
  return { sent, failed, total: subscribers.length };
}
export async function dispatchDue(now = Date.now()) {
  const readiness = mailReadiness();
  const due = await query<Newsletter>(
    "SELECT * FROM zone_newsletters WHERE send_status='scheduled' AND scheduled_at<=$1",
    [now],
  );
  for (const edition of due) {
    if (
      !readiness.enabled ||
      !readiness.keyConfigured ||
      !readiness.senderConfigured
    ) {
      await query(
        "UPDATE zone_newsletters SET send_status='blocked',error='Échéance atteinte : configurer et activer le fournisseur email pour envoyer.' WHERE id=$1 AND send_status='scheduled'",
        [edition.id],
      );
      continue;
    }
    try {
      await broadcast(edition.id);
    } catch (e) {
      await query(
        "UPDATE zone_newsletters SET send_status='blocked',error=$1 WHERE id=$2 AND send_status='scheduled'",
        [e instanceof Error ? e.message : "Envoi bloqué", edition.id],
      );
    }
  }
}
