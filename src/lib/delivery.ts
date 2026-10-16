import { randomUUID } from "node:crypto";
import { query } from "./db";
import { type Edition, type Selection } from "./domain";
import { getProfile } from "./store";
import { appUrl, newToken } from "./security";
import { renderEmail } from "./email";
import { type EmailProvider } from "./providers";

/** Test transport only in this milestone. No production activation path. */
export async function sendTestEdition(
  editionId: string,
  provider: EmailProvider,
  config: { mode: string; allowlist: string[] },
) {
  if (config.mode !== "test") throw new Error("Envois désactivés");
  const edition = (
    await query<Edition>("SELECT * FROM editions WHERE id=$1", [editionId])
  )[0];
  if (!edition?.data || edition.status !== "approved")
    throw new Error("Approbation humaine requise");
  const profile = await getProfile(edition.profile_id);
  if (
    !profile ||
    !profile.confirmedAt ||
    profile.unsubscribedAt ||
    profile.revision !== edition.revision
  )
    throw new Error("Profil non confirmé, désinscrit ou modifié");
  if (!config.allowlist.map((x) => x.toLowerCase()).includes(profile.email))
    throw new Error("Destinataire absent de la liste de test autorisée");
  if (
    profile.subscription !== "active" &&
    (profile.subscription !== "trial" || profile.trialUsed >= 4)
  )
    throw new Error("Essai terminé");
  const data = JSON.parse(edition.data) as Selection;
  const id = randomUUID();
  await query(
    "INSERT INTO deliveries(id,edition_id,profile_id,weekend,state,updated_at) VALUES($1,$2,$3,$4,'queued',$5) ON CONFLICT(profile_id,weekend) DO NOTHING",
    [id, edition.id, profile.id, edition.weekend, Date.now()],
  );
  const claimed = await query<{ id: string; payload: string | null }>(
    "UPDATE deliveries SET state='sending',error=NULL,updated_at=$1 WHERE profile_id=$2 AND weekend=$3 AND edition_id=$4 AND state IN ('queued','failed') RETURNING id,payload",
    [Date.now(), profile.id, edition.weekend, edition.id],
  );
  if (!claimed.length) return { status: "duplicate" as const };
  const deliveryId = claimed[0].id;
  try {
    // Recheck withdrawal immediately before dispatch. A provider request already in flight cannot be recalled.
    if ((await getProfile(profile.id))?.unsubscribedAt)
      throw new Error("Profil désinscrit");
    let content: ReturnType<typeof renderEmail>;
    if (claimed[0].payload) content = JSON.parse(claimed[0].payload);
    else {
      const manage = await newToken(profile.id, "manage", 7 * 86400_000);
      const unsubscribe = await newToken(
        profile.id,
        "unsubscribe",
        180 * 86400_000,
      );
      content = renderEmail(profile, data, {
        manage: `${appUrl()}/lien/manage#token=${manage}`,
        unsubscribe: `${appUrl()}/lien/unsubscribe#token=${unsubscribe}`,
      });
      await query("UPDATE deliveries SET payload=$1 WHERE id=$2", [
        JSON.stringify(content),
        deliveryId,
      ]);
    }
    const result = await provider.send({
      to: profile.email,
      ...content,
      idempotencyKey: deliveryId,
    });
    await query(
      "UPDATE deliveries SET state='sent',provider_id=$1,updated_at=$2 WHERE id=$3",
      [result.id, Date.now(), deliveryId],
    );
    await query(
      "INSERT INTO delivery_attempts(id,delivery_id,state,created_at) VALUES($1,$2,'sent',$3)",
      [randomUUID(), deliveryId, Date.now()],
    );
    // Test delivery does not consume one of the four real trial editions.
    return { status: "sent" as const };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Échec du fournisseur";
    await query(
      "UPDATE deliveries SET state='failed',error=$1,updated_at=$2 WHERE id=$3",
      [message, Date.now(), deliveryId],
    );
    await query(
      "INSERT INTO delivery_attempts(id,delivery_id,state,error,created_at) VALUES($1,$2,'failed',$3,$4)",
      [randomUUID(), deliveryId, message, Date.now()],
    );
    throw error;
  }
}
