import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import webpush from "web-push";

import { E2E_CRON_SECRET } from "./e2e/env";

// Test süreci (ör. e2e/helpers.ts → makeAdmin) veritabanına kök .env ile bağlanır; CI'da ortamdan gelir.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const ENGINE_PORT = Number(process.env.E2E_ENGINE_PORT ?? 8100);
const engineURL = `http://localhost:${ENGINE_PORT}`;
const POSTHOG_PORT = Number(process.env.E2E_POSTHOG_PORT ?? 8200);
const posthogURL = `http://localhost:${POSTHOG_PORT}`;
const PUSH_PORT = Number(process.env.E2E_PUSH_PORT ?? 8300);
const pushOrigin = `http://127.0.0.1:${PUSH_PORT}`;
// Her çalıştırmada yeni VAPID anahtarı (test sunucusu başlarken; sahte push servisi doğrulamaz).
const vapid = webpush.generateVAPIDKeys();
// Test motoru ile test sunucusu arasında paylaşılan anahtar (gerçek ortamın anahtarı değil).
const engineToken = "e2e-engine-token";

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
  webServer: [
    {
      // Sahte PostHog: analitik olaylarında kişisel veri olmadığını doğrulamak için (analytics.spec).
      command: "node e2e/fake-posthog.mjs",
      url: `${posthogURL}/health`,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_POSTHOG_PORT: String(POSTHOG_PORT) },
    },
    {
      // Sahte web push servisi (push.spec): şifreli bildirimleri toplar.
      command: "node e2e/fake-push.mjs",
      url: `${pushOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_PUSH_PORT: String(PUSH_PORT) },
    },
    {
      // Optimizasyon motoru (plan sayfası). Python 3.12 + uv gerekir.
      command: `uv run uvicorn engine.api:app --port ${ENGINE_PORT}`,
      cwd: path.resolve(import.meta.dirname, "../../services/engine"),
      url: `${engineURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ENGINE_TOKEN: engineToken },
    },
    {
      command: `pnpm build && pnpm start --port ${PORT}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Magic link bağlantıları test sunucusunun adresini göstersin.
      env: {
        AUTH_URL: baseURL,
        NEXT_TELEMETRY_DISABLED: "1",
        ENGINE_URL: engineURL,
        ENGINE_TOKEN: engineToken,
        CRON_SECRET: E2E_CRON_SECRET,
        APP_URL: baseURL,
        NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e",
        NEXT_PUBLIC_POSTHOG_HOST: posthogURL,
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:e2e@kartplan.test",
        PUSH_EXTRA_ORIGINS: pushOrigin,
      },
    },
  ],
});
