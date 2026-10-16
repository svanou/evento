/** Optional fixed calendar date for reproducible demo scenarios; never affects token/lease expiry. */
export function referenceNow(): Date {
  if (
    (process.env.APP_MODE || "demo") === "demo" &&
    process.env.DEMO_REFERENCE_DATE
  ) {
    const date = new Date(process.env.DEMO_REFERENCE_DATE);
    if (!Number.isFinite(date.getTime()))
      throw new Error("DEMO_REFERENCE_DATE invalide");
    return date;
  }
  return new Date();
}
