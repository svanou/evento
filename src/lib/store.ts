import { randomUUID } from "node:crypto";
import { query } from "./db";
import {
  type Edition,
  type Preferences,
  type Profile,
  type Selection,
  weekendFor,
  zoneFor,
} from "./domain";
import { newToken, privateHash } from "./security";
import { referenceNow } from "./clock";

export async function getProfile(id: string): Promise<Profile | null> {
  const row = (
    await query<{ data: string }>("SELECT data FROM profiles WHERE id=$1", [id])
  )[0];
  return row ? JSON.parse(row.data) : null;
}
export async function mutateProfile(
  id: string,
  change: (p: Profile) => Profile,
): Promise<Profile> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const profile = await getProfile(id);
    if (!profile) throw new Error("Profil introuvable");
    const next = change(profile);
    const rows = await query(
      "UPDATE profiles SET data=$1,revision=$2 WHERE id=$3 AND data=$4 RETURNING id",
      [JSON.stringify(next), next.revision, id, JSON.stringify(profile)],
    );
    if (rows.length) return next;
  }
  throw new Error("Modification simultanée. Réessayez.");
}
export async function createProfile(input: Preferences) {
  const id = randomUUID();
  const profile: Profile = {
    ...input,
    id,
    revision: 1,
    zone: zoneFor(input.origin, input.country),
    confirmedAt: null,
    unsubscribedAt: null,
    trialUsed: 0,
    subscription: "trial",
    createdAt: Date.now(),
  };
  const created = await query(
    "INSERT INTO profiles(id,email_hash,revision,data,created_at) VALUES($1,$2,1,$3,$4) ON CONFLICT(email_hash) DO NOTHING RETURNING id",
    [id, privateHash(input.email), JSON.stringify(profile), profile.createdAt],
  );
  if (!created.length)
    throw new Error(
      "Cette inscription ne peut pas être créée. Utilisez votre session ou votre lien de gestion existant.",
    );
  await query(
    "INSERT INTO consents(id,profile_id,kind,version,created_at) VALUES($1,$2,'weekly-email','2026-01',$3)",
    [randomUUID(), id, Date.now()],
  );
  const session = await newToken(id, "session", 30 * 86400_000);
  const confirm = await newToken(id, "confirm", 24 * 3600_000);
  if (profile.zone !== "waiting") await enqueue(id);
  return { profile, session, confirm };
}
export async function editProfile(id: string, input: Preferences) {
  const profile = await getProfile(id);
  if (!profile || profile.email !== input.email)
    throw new Error(
      "L’adresse email ne peut pas être modifiée dans cette tranche.",
    );
  const next = await mutateProfile(id, (p) => ({
    ...p,
    ...input,
    revision: p.revision + 1,
    zone: zoneFor(input.origin, input.country),
  }));
  await query(
    "UPDATE jobs SET status='cancelled',lease=NULL WHERE edition_id IN (SELECT id FROM editions WHERE profile_id=$1 AND revision<>$2) AND status IN ('queued','processing')",
    [id, next.revision],
  );
  await query(
    "UPDATE editions SET status='failed',error='Préférences modifiées : préparation remplacée' WHERE profile_id=$1 AND revision<>$2 AND status IN ('queued','processing')",
    [id, next.revision],
  );
  if (next.zone !== "waiting" && !next.unsubscribedAt) await enqueue(id);
  return next;
}
export async function enqueue(
  id: string,
  now = referenceNow(),
): Promise<Edition | null> {
  const profile = await getProfile(id);
  if (!profile || profile.zone === "waiting" || profile.unsubscribedAt)
    return null;
  const weekend = weekendFor(now, profile.timezone);
  await query(
    "INSERT INTO editions(id,profile_id,weekend,revision,status,created_at,updated_at) VALUES($1,$2,$3,$4,'queued',$5,$5) ON CONFLICT(profile_id,weekend,revision) DO NOTHING",
    [randomUUID(), id, weekend.key, profile.revision, Date.now()],
  );
  const edition = (
    await query<Edition>(
      "SELECT * FROM editions WHERE profile_id=$1 AND weekend=$2 AND revision=$3",
      [id, weekend.key, profile.revision],
    )
  )[0];
  await query(
    "INSERT INTO jobs(id,edition_id,status,run_after,created_at) VALUES($1,$2,'queued',$3,$3) ON CONFLICT(edition_id) DO NOTHING",
    [randomUUID(), edition.id, Date.now()],
  );
  return edition;
}
export async function editionsFor(id: string) {
  return query<Edition>(
    "SELECT * FROM editions WHERE profile_id=$1 ORDER BY created_at DESC",
    [id],
  );
}
export async function unsubscribe(id: string) {
  await mutateProfile(id, (p) => ({ ...p, unsubscribedAt: Date.now() }));
  await query(
    "INSERT INTO consents(id,profile_id,kind,version,created_at) VALUES($1,$2,'withdrawn','2026-01',$3)",
    [randomUUID(), id, Date.now()],
  );
  await query(
    "UPDATE jobs SET status='cancelled',lease=NULL WHERE edition_id IN (SELECT id FROM editions WHERE profile_id=$1) AND status IN ('queued','processing')",
    [id],
  );
  await query(
    "UPDATE editions SET status='failed',error='Désinscription : préparation annulée' WHERE profile_id=$1 AND status IN ('queued','processing')",
    [id],
  );
}
export async function deleteProfile(id: string) {
  await query("DELETE FROM profiles WHERE id=$1", [id]);
}
export async function approveEdition(id: string, keepIds: string[]) {
  const edition = (
    await query<Edition>("SELECT * FROM editions WHERE id=$1", [id])
  )[0];
  if (!edition?.data || !["ready", "approved"].includes(edition.status))
    throw new Error("Sélection non prête");
  const profile = await getProfile(edition.profile_id);
  if (
    !profile ||
    profile.revision !== edition.revision ||
    profile.unsubscribedAt
  )
    throw new Error(
      "Profil modifié ou désinscrit : nouvelle préparation nécessaire",
    );
  const selection = JSON.parse(edition.data) as Selection;
  if (
    keepIds.length > 5 ||
    keepIds.some(
      (id) =>
        !selection.items.some(
          (i) => i.candidate.id === id && i.decision === "selected",
        ),
    )
  )
    throw new Error(
      "Seules les propositions conformes peuvent être approuvées",
    );
  for (const item of selection.items)
    if (item.decision === "selected" && !keepIds.includes(item.candidate.id)) {
      item.decision = "rejected";
      item.reasons.push("Retirée lors de la revue humaine");
    }
  const result = await query(
    "UPDATE editions SET status='approved',data=$1,updated_at=$2 WHERE id=$3 AND data=$4 AND EXISTS(SELECT 1 FROM profiles WHERE id=$5 AND revision=$6) RETURNING id",
    [
      JSON.stringify(selection),
      Date.now(),
      id,
      edition.data,
      profile.id,
      profile.revision,
    ],
  );
  if (!result.length)
    throw new Error("La sélection a changé. Rechargez la page.");
}
