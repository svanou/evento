export function databaseSetupRequired() {
  return !!process.env.VERCEL && !process.env.DATABASE_URL?.trim();
}

export class DatabaseConfigurationError extends Error {
  constructor() {
    super(
      "Configurer DATABASE_URL sur Vercel, appliquer les migrations Supabase, puis redéployer.",
    );
    this.name = "DatabaseConfigurationError";
  }
}
