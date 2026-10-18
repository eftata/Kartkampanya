/**
 * Hata takibi (Sentry) ve ürün analitiğine (PostHog) giden verinin kişisel veriden arındırılması
 * (ADR 0022). Saf modül; tarayıcıda ve sunucuda aynı kurallar.
 *
 * - E-posta adresleri ve uzun rakam dizileri (kart numarası gibi) metinden silinir.
 * - Adreslerin sorgu dizgisi yalnızca izin verilen filtre parametreleriyle kalır: giriş bağlantısı
 *   (`token`, `email`), abonelikten çıkma imzası vb. hiçbir zaman gitmez. Parça (#) silinir.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 12+ rakam (aralarında boşluk/tire olabilir): kart numarası, telefon, kimlik no. */
const LONG_NUMBER = /\b\d(?:[ -]?\d){11,}\b/g;

/** Filtre parametreleri: kişisel değil, ürün kararları için anlamlı. */
const SAFE_QUERY_PARAMS = new Set([
  "program",
  "kategori",
  "kart",
  "tur",
  "sirala",
  "month",
  "hesap",
]);

export function scrubText(text: string): string {
  return text.replace(EMAIL, "[e-posta]").replace(LONG_NUMBER, "[sayı]");
}

/** Mutlak ya da göreli adres; çözümlenemezse metin olarak temizlenir. */
export function scrubUrl(url: string): string {
  let parsed: URL;
  const relative = url.startsWith("/");
  try {
    parsed = new URL(url, relative ? "http://x" : undefined);
  } catch {
    return scrubText(url);
  }
  if (!/^https?:$/.test(parsed.protocol)) return scrubText(url);
  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (SAFE_QUERY_PARAMS.has(key)) kept.append(key, scrubText(value));
  }
  const query = kept.size ? `?${kept.toString()}` : "";
  const path = scrubText(decodeURIComponentSafe(parsed.pathname));
  return relative ? `${path}${query}` : `${parsed.origin}${path}${query}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const isUrlLike = (value: string) => /^(https?:\/\/|\/)/.test(value);

/**
 * İç içe değerleri dolaşır: adresler `scrubUrl`, diğer metinler `scrubText`. `keep` anahtarındaki
 * değerlere dokunulmaz (ör. analitik oturum kimlikleri rakam dizisi içerebilir).
 */
export function scrubValue(
  value: unknown,
  keep: (key: string) => boolean = () => false,
  depth = 0,
): unknown {
  if (typeof value === "string") return isUrlLike(value) ? scrubUrl(value) : scrubText(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, keep, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      keep(key) ? item : scrubValue(item, keep, depth + 1),
    ]),
  );
}

// --- Sentry ---------------------------------------------------------------------------------

type SentryLikeEvent = {
  message?: string;
  user?: unknown;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
    data?: unknown;
  };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: SentryLikeBreadcrumb[];
  extra?: Record<string, unknown>;
};

type SentryLikeBreadcrumb = { message?: string; data?: Record<string, unknown> };

/** Sentry `beforeSend`: kullanıcı, çerez, başlık, gövde silinir; metinler ve adresler temizlenir. */
export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  delete event.user;
  if (event.request) {
    const { url } = event.request;
    event.request = url ? { url: scrubUrl(url) } : {};
  }
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  return event;
}

/** Sentry `beforeBreadcrumb`: gezinme/istek adresleri ve konsol mesajları. */
export function scrubBreadcrumb<T extends SentryLikeBreadcrumb>(breadcrumb: T): T {
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  return breadcrumb;
}

// --- PostHog --------------------------------------------------------------------------------

/** PostHog'un kendi kimlik alanları (rastgele; kişisel değil, değişirse oturumlar kopar). */
const ANALYTICS_ID_KEY =
  /^(distinct_id|token|uuid|\$(device|session|window|insert|anon_distinct)_id)$/;

/** PostHog `before_send`: IP silinir, kimlik alanları dışındaki tüm özellikler temizlenir. */
export function scrubAnalyticsEvent<T extends { properties?: Record<string, unknown> }>(
  event: T | null,
): T | null {
  if (!event) return null;
  if (event.properties) {
    const properties = scrubValue(event.properties, (key) => ANALYTICS_ID_KEY.test(key)) as Record<
      string,
      unknown
    >;
    delete properties.$ip;
    event.properties = properties;
  }
  return event;
}
