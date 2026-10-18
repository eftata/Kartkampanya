/**
 * Tüm yanıtlara eklenen güvenlik başlıkları (ADR 0021; `next.config.ts → headers()`).
 *
 * CSP nonce'suz: `cacheComponents` statik kabukları build'de üretir, nonce her istekte yeni
 * olmalıydı (tüm sayfalar dinamik olurdu). Bu yüzden satır içi betiklere (Next'in RSC yükü)
 * `'unsafe-inline'` izni var; dış kaynaklı betik, çerçeveleme, eklenti, `<base>` ve başka adrese
 * form gönderimi yasak. Yeni dış servis (Sentry, PostHog) eklenince `connect-src`'ye eklenir.
 */

export type SecurityHeaderOptions = { dev: boolean; appUrl?: string };

export function contentSecurityPolicy({ dev, appUrl }: SecurityHeaderOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Geliştirmede React hata ayıklama bilgisi için eval kullanır.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Google ile girişte profil fotoğrafı.
    "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Google ile giriş formu Google'a yönlenir.
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Yerel http (geliştirme, e2e) adresinde istekler https'e çevrilmesin.
  if (!dev && !appUrl?.startsWith("http://")) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // Tarayıcı iki yıl yalnızca HTTPS kullanır (http yanıtlarında tarayıcı yok sayar).
    ...(options.dev
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
