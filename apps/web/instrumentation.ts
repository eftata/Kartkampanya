import * as Sentry from "@sentry/nextjs";

import { scrubBreadcrumb, scrubSentryEvent } from "@/lib/telemetry/scrub";
import { sentryBaseOptions, sentryDsn, sentryEnvironment } from "@/lib/telemetry/config";

/** Sunucu hata takibi (ADR 0022). DSN yoksa Sentry başlatılmaz. */
export function register() {
  const dsn = sentryDsn();
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    ...sentryBaseOptions,
    dsn,
    environment: sentryEnvironment(),
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

/** Sayfa, route handler, Server Action ve proxy hataları. */
export const onRequestError = Sentry.captureRequestError;
