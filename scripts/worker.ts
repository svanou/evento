// Optional local runner. Production runs through Vercel after() and Cron.
import { runAutomation } from "../src/lib/automation";
import { initialize, closeDb } from "../src/lib/db";
await initialize();
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
do {
  try {
    await runAutomation({ source: "worker" });
  } catch {
    console.error(
      "Traitement interrompu : vérifier la configuration et les tâches.",
    );
    process.exitCode = 1;
  }
  if (process.argv.includes("--once")) break;
  if (running) await new Promise((resolve) => setTimeout(resolve, 10000));
} while (running);
await closeDb();
