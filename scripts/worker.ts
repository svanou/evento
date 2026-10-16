import { dispatchDue } from "../src/lib/delivery";
import { initialize, closeDb } from "../src/lib/db";
import { processOne, schedule } from "../src/lib/jobs";
await initialize();
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
let lastScheduled = 0;
console.log(
  "Worker Evento démarré. Les envois nécessitent une activation explicite du fournisseur.",
);
do {
  try {
    if (
      process.env.SCHEDULER_ENABLED === "true" &&
      Date.now() - lastScheduled > 60_000
    ) {
      await schedule();
      lastScheduled = Date.now();
    }
    await dispatchDue();
    const worked = await processOne();
    if (process.argv.includes("--once")) break;
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(
      "Worker :",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    if (process.argv.includes("--once")) {
      process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
} while (running);
await closeDb();
