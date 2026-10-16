import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { query } from "./db";
import {
  type Subscriber,
  type Newsletter,
  type Content,
  type Edit,
  type Source,
  editSchema,
  weekendFor,
} from "./domain";
import { newToken, privateHash } from "./security";
import { getZone } from "./zones";
import { referenceNow } from "./clock";

export async function getSubscriber(id: string) {
  return (
    (
      await query<Subscriber>(
        "SELECT id,email,zone,confirmed_at,unsubscribed_at,created_at FROM subscribers WHERE id=$1",
        [id],
      )
    )[0] || null
  );
}
export async function subscribe(email: string, zone: string) {
  await getZone(zone);
  const id = randomUUID();
  const added = await query(
    "INSERT INTO subscribers(id,email,email_hash,zone,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email_hash,zone) DO NOTHING RETURNING id",
    [id, email, privateHash(email), zone, Date.now()],
  );
  if (!added.length)
    throw new Error(
      "Inscription existante : utilisez votre session ou votre lien de gestion.",
    );
  await query(
    "INSERT INTO subscriber_consents(id,subscriber_id,kind,version,created_at) VALUES($1,$2,'zone-newsletter','free-zones-v1',$3)",
    [randomUUID(), id, Date.now()],
  );
  // An additional reader never creates a preparation. Editions belong to zones.
  return {
    subscriber: await getSubscriber(id),
    session: await newToken(id, "session", 30 * 86400_000),
  };
}
export async function confirmSubscriber(id: string) {
  const row = await getSubscriber(id);
  if (!row || row.unsubscribed_at)
    throw new Error("Abonnement désinscrit ou introuvable");
  await query(
    "UPDATE subscribers SET confirmed_at=$1 WHERE id=$2 AND unsubscribed_at IS NULL",
    [Date.now(), id],
  );
}
export async function unsubscribe(id: string) {
  await query("UPDATE subscribers SET unsubscribed_at=$1 WHERE id=$2", [
    Date.now(),
    id,
  ]);
  await query(
    "INSERT INTO subscriber_consents(id,subscriber_id,kind,version,created_at) VALUES($1,$2,'withdrawn','free-zones-v1',$3)",
    [randomUUID(), id, Date.now()],
  );
  // Shared editorial content is kept for the other readers.
}
export async function deleteSubscriber(id: string) {
  await query("DELETE FROM subscribers WHERE id=$1", [id]);
}
export async function getNewsletter(id: string) {
  return (
    (
      await query<Newsletter>("SELECT * FROM zone_newsletters WHERE id=$1", [
        id,
      ])
    )[0] || null
  );
}
export async function newsletters(zone: string) {
  return query<Newsletter>(
    "SELECT * FROM zone_newsletters WHERE zone=$1 ORDER BY weekend DESC",
    [zone],
  );
}
export async function audit(
  id: string,
  action: string,
  actor: string,
  revision: number,
) {
  await query(
    "INSERT INTO newsletter_audit(id,newsletter_id,action,actor,revision,created_at) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), id, action, actor, revision, Date.now()],
  );
}
export async function enqueue(zone: string, now = referenceNow()) {
  const config = await getZone(zone);
  const weekend = weekendFor(now, config.timezone);
  await query(
    "INSERT INTO zone_newsletters(id,zone,weekend,preparation_status,created_at,updated_at) VALUES($1,$2,$3,'queued',$4,$4) ON CONFLICT(zone,weekend) DO NOTHING",
    [randomUUID(), zone, weekend.key, Date.now()],
  );
  const edition = (
    await query<Newsletter>(
      "SELECT * FROM zone_newsletters WHERE zone=$1 AND weekend=$2",
      [zone, weekend.key],
    )
  )[0];
  await query(
    "INSERT INTO newsletter_jobs(id,newsletter_id,status,run_after,created_at) VALUES($1,$2,'queued',$3,$3) ON CONFLICT(newsletter_id) DO NOTHING",
    [randomUUID(), edition.id, Date.now()],
  );
  return edition;
}
export async function retryPreparation(id: string) {
  const edition = await getNewsletter(id);
  const empty =
    edition?.preparation_status === "ready" &&
    edition.content &&
    !(JSON.parse(edition.content) as Content).articles.length;
  const failed = edition?.preparation_status === "failed" && !edition.content;
  if (!edition || (!empty && !failed))
    throw new Error(
      "Seule une préparation échouée ou sans sortie retenue peut être relancée",
    );
  const changed = await query(
    "UPDATE zone_newsletters SET preparation_status='queued',content=NULL,error=NULL,revision=revision+1,approved_revision=NULL,send_status='not_scheduled',scheduled_at=NULL WHERE id=$1 AND revision=$2 AND preparation_status IN ('ready','failed') AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=$1) RETURNING id",
    [id, edition.revision],
  );
  if (!changed.length)
    throw new Error("Édition modifiée entre-temps ou en cours d’envoi");
  await query(
    "UPDATE newsletter_jobs SET status='queued',attempt=0,run_after=$1,error=NULL,lease=NULL WHERE newsletter_id=$2 AND status IN ('failed','completed')",
    [Date.now(), id],
  );
}
export async function editNewsletter(id: string, raw: Edit, actor: string) {
  const input = editSchema.parse(raw);
  const edition = await getNewsletter(id);
  if (
    !edition?.content ||
    !["ready", "approved"].includes(edition.preparation_status)
  )
    throw new Error("Édition non prête");
  if (
    ["sending", "sent"].includes(edition.send_status) ||
    (await hasDeliveries(id))
  )
    throw new Error(
      "Une édition dont l’envoi a commencé ne peut plus être modifiée",
    );
  const content = JSON.parse(edition.content) as Content;
  const included = content.reviews
    .filter((i) => i.decision === "included")
    .map((i) => i.candidate);
  const articles = input.articles.map((edit) => {
    const original = included.find((i) => i.id === edit.id);
    if (!original)
      throw new Error(
        "Seules les propositions vérifiées de la sélection peuvent être publiées",
      );
    // Source, date, price and provenance are preserved; changes concern editorial copy and order.
    return { ...original, title: edit.title, description: edit.description };
  });
  const updated = {
    ...content,
    subject: input.subject,
    introduction: input.introduction,
    articles,
    sponsor: input.sponsor,
  };
  const changed = await query(
    "UPDATE zone_newsletters SET content=$1,revision=revision+1,preparation_status='ready',approved_revision=NULL,send_status='not_scheduled',scheduled_at=NULL,updated_at=$2 WHERE id=$3 AND revision=$4 AND send_status NOT IN ('sending','sent') AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=$3) RETURNING id",
    [JSON.stringify(updated), Date.now(), id, input.revision],
  );
  if (!changed.length)
    throw new Error(
      "Édition modifiée entre-temps ou en cours d’envoi. Rechargez-la.",
    );
  await audit(id, "edited", actor, input.revision + 1);
}
async function hasDeliveries(id: string) {
  return (
    (
      await query(
        "SELECT id FROM newsletter_deliveries WHERE newsletter_id=$1 LIMIT 1",
        [id],
      )
    ).length > 0
  );
}
export async function approveNewsletter(
  id: string,
  revision: number,
  actor: string,
) {
  const edition = await getNewsletter(id);
  if (
    !edition?.content ||
    !(JSON.parse(edition.content) as Content).articles.length
  )
    throw new Error("Ajoutez au moins une sortie retenue avant approbation");
  const changed = await query(
    "UPDATE zone_newsletters SET preparation_status='approved',approved_revision=revision,updated_at=$1 WHERE id=$2 AND revision=$3 AND preparation_status IN ('ready','approved') RETURNING id",
    [Date.now(), id, revision],
  );
  if (!changed.length)
    throw new Error("Édition modifiée entre-temps. Rechargez-la.");
  await audit(id, "approved", actor, revision);
}
export async function scheduleNewsletter(
  id: string,
  revision: number,
  iso: string,
  actor: string,
) {
  const time = DateTime.fromISO(iso, { setZone: true });
  const edition = await getNewsletter(id);
  if (!time.isValid || !edition)
    throw new Error("Date de programmation invalide");
  const deadline = DateTime.fromISO(edition.weekend, {
    zone: (await getZone(edition.zone)).timezone,
  }).startOf("day");
  if (time.toMillis() <= Date.now() || time.toMillis() >= deadline.toMillis())
    throw new Error(
      "Programmez dans le futur, avant le début du week-end de cette édition",
    );
  const changed = await query(
    "UPDATE zone_newsletters SET send_status='scheduled',scheduled_at=$1,updated_at=$2 WHERE id=$3 AND revision=$4 AND preparation_status='approved' AND approved_revision=$4 AND send_status NOT IN ('sending','sent') AND NOT EXISTS(SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=$3) RETURNING id",
    [time.toMillis(), Date.now(), id, revision],
  );
  if (!changed.length)
    throw new Error(
      "Approbation de la dernière version requise, et aucun envoi commencé",
    );
  await audit(id, "scheduled", actor, revision);
}
export async function cancelSchedule(id: string, actor: string) {
  const changed = await query<{ revision: number }>(
    "UPDATE zone_newsletters SET send_status='not_scheduled',scheduled_at=NULL WHERE id=$1 AND send_status IN ('scheduled','blocked') RETURNING revision",
    [id],
  );
  if (!changed.length)
    throw new Error("Cette programmation ne peut plus être annulée");
  await audit(id, "schedule_cancelled", actor, changed[0].revision);
}
export async function listSources(zone = "pays-de-gex") {
  return query<Source>(
    "SELECT * FROM newsletter_sources WHERE zone=$1 ORDER BY created_at",
    [zone],
  );
}
