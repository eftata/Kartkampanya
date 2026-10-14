import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * Kritik akış testleri. Önkoşullar: Postgres + Mailpit ayakta (`docker compose up -d`),
 * migration'lar uygulanmış (`pnpm db:deploy`), kök .env içinde AUTH_SECRET dolu.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "tr-TR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Magic link bağlantıları test sunucusunun adresini göstersin.
    env: { AUTH_URL: baseURL, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
