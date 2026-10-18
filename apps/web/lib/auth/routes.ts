/** Giriş gerektiren yollar: `(app)` rota grubu ve admin paneli. */
const PROTECTED_PREFIXES = [
  "/plan",
  "/baslangic",
  "/kartlarim",
  "/kampanyalarim",
  "/profil",
  "/admin",
  "/onay",
  "/geri-bildirim",
  "/harcamalar",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Giriş yapmamış kullanıcının gönderildiği yer (landing). */
export const SIGNED_OUT_REDIRECT = "/";
/** Girişten sonra varsayılan hedef. */
export const SIGNED_IN_REDIRECT = "/plan";

/** Auth.js oturum çerezi adları (HTTPS'te `__Secure-` önekli). */
export const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

/** KVKK onay ekranı: giriş yapmış ama güncel metinleri onaylamamış kullanıcı buraya yönlenir. */
export const CONSENT_PATH = "/onay";

/** Giriş bağlantısı isteği sınırı aşıldı (ADR 0021). */
export const MAGIC_LINK_LIMIT_MESSAGE =
  "Çok fazla giriş bağlantısı istendi. Gelen kutunu (ve gereksiz klasörünü) kontrol et ya da bir süre sonra yeniden dene.";

/** Silinmiş hesapla giriş denemesi (Auth.js AccessDenied; ADR 0019). */
export const ACCESS_DENIED_MESSAGE =
  "Bu hesapla giriş yapılamıyor. Hesabını sildiysen silme işlemi 30 gün içinde tamamlanır.";

/** Genel istek sınırının dışında kalan API yolları: zamanlanmış işler (anahtarlı) ve sağlık. */
const UNLIMITED_API_PREFIXES = ["/api/cron/", "/api/health"] as const;

/**
 * proxy'nin istek sınırı uyguladığı istekler (ADR 0021): tüm API çağrıları ve sayfalara yapılan
 * her yazma isteği (Server Action, form). Sayfa görüntüleme (GET) sınırlanmaz.
 */
export function isRateLimitedRequest(method: string, pathname: string): boolean {
  if (UNLIMITED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  if (pathname.startsWith("/api/")) return true;
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
