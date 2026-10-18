/**
 * Hata takibi ve analitik ayarları (ADR 0022). `NEXT_PUBLIC_*` değerleri build'de tarayıcı koduna
 * gömülür (turbo.json → build.env); boşsa ilgili servis hiç başlatılmaz.
 */

export const sentryDsn = () => process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
export const sentryEnvironment = () =>
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";

export const posthogKey = () => process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined;
export const posthogHost = () =>
  (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com").replace(/\/+$/, "");

/** Ortak Sentry seçenekleri: yalnızca hatalar (performans izleme, oturum kaydı yok), kişisel veri yok. */
export const sentryBaseOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 30,
} as const;
