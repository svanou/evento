import { cache } from "react";
import { notFound } from "next/navigation";
import { getZone } from "./zones";
import { databaseSetupRequired } from "./deployment";
export const zoneFor = cache(async (agenda: string) => {
  if (!agenda.startsWith("agenda-")) notFound();
  if (databaseSetupRequired()) {
    console.error(
      "[Evento: DATABASE_URL_MISSING] Configurer DATABASE_URL sur Vercel, appliquer les migrations Supabase, puis redéployer.",
    );
    return null;
  }
  try {
    return await getZone(agenda.slice(7));
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "Cette zone n’est pas encore ouverte."
    )
      notFound();
    throw e;
  }
});
