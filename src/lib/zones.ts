import { query } from "./db";
import { type Zone, zoneSchema } from "./domain";
export async function getZone(id: string, allowDraft = false): Promise<Zone> {
  const zone = (
    await query<Zone>("SELECT * FROM newsletter_zones WHERE id=$1", [id])
  )[0];
  if (!zone || (!allowDraft && zone.status !== "active"))
    throw new Error("Cette zone n’est pas encore ouverte.");
  return zone;
}
export async function listZones(all = false) {
  return query<Zone>(
    `SELECT * FROM newsletter_zones ${all ? "" : "WHERE status='active'"} ORDER BY name`,
  );
}
export async function saveZone(raw: unknown, create: boolean) {
  const zone = zoneSchema.parse(raw);
  if (create && zone.status !== "draft")
    throw new Error(
      "Créez d’abord la zone en brouillon et ajoutez ses sources.",
    );
  if (!create && zone.status === "active") {
    const sources = await query(
      "SELECT id FROM newsletter_sources WHERE zone=$1 AND enabled=1 LIMIT 1",
      [zone.id],
    );
    if (!sources.length)
      throw new Error(
        "Ajoutez au moins une source active avant d’ouvrir la zone.",
      );
  }
  if (create) {
    const rows = await query(
      "INSERT INTO newsletter_zones(id,name,timezone,country,currency,language,status,send_day,send_hour) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id",
      [
        zone.id,
        zone.name,
        zone.timezone,
        zone.country,
        zone.currency,
        zone.language,
        zone.status,
        zone.send_day,
        zone.send_hour,
      ],
    );
    if (!rows.length) throw new Error("Cette adresse de zone existe déjà.");
  } else {
    const rows = await query(
      "UPDATE newsletter_zones SET name=$2,timezone=$3,country=$4,currency=$5,language=$6,status=$7,send_day=$8,send_hour=$9 WHERE id=$1 RETURNING id",
      [
        zone.id,
        zone.name,
        zone.timezone,
        zone.country,
        zone.currency,
        zone.language,
        zone.status,
        zone.send_day,
        zone.send_hour,
      ],
    );
    if (!rows.length) throw new Error("Zone introuvable");
    if (zone.status === "draft")
      await query(
        "UPDATE zone_newsletters SET send_status='not_scheduled',scheduled_at=NULL WHERE zone=$1 AND send_status IN ('scheduled','blocked')",
        [zone.id],
      );
  }
  return zone;
}
