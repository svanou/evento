import { defineConfig } from "@playwright/test";
// Separate database, no worker and no external providers in browser tests.
const directory = process.env.EVENTO_E2E_DATA_DIR || `.data/e2e-${Date.now()}`;
process.env.EVENTO_E2E_DATA_DIR = directory;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_URL: "http://127.0.0.1:3100",
      DATA_DIR: directory,
      DATABASE_URL: "",
      ADMIN_AUTH_MODE: "local",
      DEV_ADMIN_PASSWORD: "evento-e2e-only",
      SESSION_SECRET: "e2e-isolated-environment-secret-32-chars",
      EMAIL_MODE: "disabled",
      OPENAI_API_KEY: "",
      SCHEDULER_ENABLED: "false",
      CRON_SECRET: "e2e-only-cron-secret-at-least-32-characters",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
