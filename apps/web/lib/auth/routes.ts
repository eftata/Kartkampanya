/** Giriş gerektiren yollar: `(app)` rota grubu ve admin paneli. */
const PROTECTED_PREFIXES = [
  "/plan",
  "/baslangic",
  "/kartlarim",
  "/kampanyalarim",
  "/profil",
  "/admin",
  "/onay",
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

/** Silinmiş hesapla giriş denemesi (Auth.js AccessDenied; ADR 0019). */
export const ACCESS_DENIED_MESSAGE =
  "Bu hesapla giriş yapılamıyor. Hesabını sildiysen silme işlemi 30 gün içinde tamamlanır.";
