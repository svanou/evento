import { defineConfig } from "@playwright/test";
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
  webServer: [
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        APP_URL: "http://127.0.0.1:3100",
        APP_MODE: "demo",
        DEMO_REFERENCE_DATE: "2026-10-09T06:00:00Z",
        DATA_DIR: ".data/e2e",
        DATABASE_URL: "",
        DEMO_ADMIN_PASSWORD: "evento-e2e-password",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
    {
      command: "npm run worker",
      wait: { stdout: /Worker Evento démarré/ },
      timeout: 30000,
      env: {
        APP_URL: "http://127.0.0.1:3100",
        APP_MODE: "demo",
        DEMO_REFERENCE_DATE: "2026-10-09T06:00:00Z",
        DATA_DIR: ".data/e2e",
        DATABASE_URL: "",
        SCHEDULER_ENABLED: "false",
      },
    },
  ],
});
