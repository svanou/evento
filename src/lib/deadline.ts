/** Enforce timeouts even if a provider forgets to observe its AbortSignal. */
export async function withDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let aborted: () => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    aborted = () => reject(new Error("Délai de préparation dépassé"));
    signal.addEventListener("abort", aborted, { once: true });
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    signal.removeEventListener("abort", aborted);
  }
}
