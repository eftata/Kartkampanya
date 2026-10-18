/** e2e test sunucularıyla paylaşılan sabitler (gerçek ortamın anahtarları değil). */
export const E2E_CRON_SECRET = "e2e-cron-secret";

/** Sahte PostHog toplayıcısı (playwright.config.ts → e2e/fake-posthog.mjs). */
export const E2E_POSTHOG_URL = `http://localhost:${process.env.E2E_POSTHOG_PORT ?? 8200}`;
