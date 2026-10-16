/** Fixed clocks are available only in automated tests, never in the product. */
export function referenceNow(): Date {
  if (process.env.NODE_ENV === "test" && process.env.TEST_REFERENCE_DATE) {
    const date = new Date(process.env.TEST_REFERENCE_DATE);
    if (!Number.isFinite(date.getTime()))
      throw new Error("TEST_REFERENCE_DATE invalide");
    return date;
  }
  return new Date();
}
