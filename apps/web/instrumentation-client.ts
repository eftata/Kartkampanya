import {
  posthogHost,
  posthogKey,
  sentryBaseOptions,
  sentryDsn,
  sentryEnvironment,
} from "@/lib/telemetry/config";
import { scrubAnalyticsEvent, scrubBreadcrumb, scrubSentryEvent } from "@/lib/telemetry/scrub";

// Servisler yapılandırılmamışsa paketleri hiç yüklemez (dinamik import).

// Tarayıcı hata takibi (ADR 0022).
const dsn = sentryDsn();
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      ...sentryBaseOptions,
      dsn,
      environment: sentryEnvironment(),
      beforeSend: (event) => scrubSentryEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    }),
  );
}

// Anonim sayfa görüntüleme analitiği: çerez/yerel depolama yok (her sekme ayrı ziyaret), kimlik
// bağlanmaz, otomatik tıklama yakalama ve oturum kaydı kapalı, dış betik yüklenmez. Kullanıcıya
// bağlı huni olayları sunucudan gider (`lib/analytics.ts`).
const key = posthogKey();
if (key) {
  void import("posthog-js").then(({ default: posthog }) =>
    posthog.init(key, {
      api_host: posthogHost(),
      persistence: "memory",
      person_profiles: "never",
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      before_send: (event) => scrubAnalyticsEvent(event),
    }),
  );
}
