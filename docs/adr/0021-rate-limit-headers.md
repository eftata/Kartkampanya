# 0021 — İstek sınırı ve güvenlik başlıkları

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Sprint 5 ve güvenlik kontrol listesi: giriş, giriş bağlantısı (magic link) ve plan hesaplama için
istek sınırı; CSP, HSTS ve HTTPS zorunluluğu. Web Vercel'de birden çok sunucu örneğinde çalışır;
yerel altyapıda zaten Redis var. Next 16 `cacheComponents` ile sayfaların statik kabuğu build'de
üretilir.

## Karar

### İstek sınırı (`apps/web/lib/rate-limit.ts`)

- **Sabit pencere** sayacı: `rl:<ad>:<kimlik özeti>:<pencere no>`, Redis'te `INCR` + `EXPIRE NX`
  (tek `MULTI`). Kimlik (e-posta, IP, oturum çerezi) SHA-256 özetiyle saklanır: Redis'te kişisel
  veri yok. Kayan pencereden daha kaba ama tek komut ve kötüye kullanıma karşı yeterli.
- **Depo:** `REDIS_URL` varsa Redis (`redis` 5, tüm örnekler ortak), yoksa süreç belleği
  (geliştirme, birim testleri). Redis'e 500 ms'de ulaşılamazsa **istek geçer** (açık başarısızlık;
  günlükte dakikada bir uyarı): sınır kötüye kullanıma karşı korumadır, Redis arızası siteyi
  kapatmamalı. Komut kuyruğu kapalı (`disableOfflineQueue`), bağlantı yokken beklenmez.
- **Katmanlar:**
  - **proxy** (Node.js çalışma zamanı): tüm `/api/*` (cron ve health hariç) ve sayfalara yapılan
    her yazma isteği (Server Action, form POST) için oturum çerezi başına, çerez yoksa IP başına
    120/dk; ayrıca IP başına 600/dk (her istekte çerez değiştirerek oturum sınırını atlatmaya
    karşı; aynı ağdaki kullanıcılar paylaştığı için geniş). Aşılırsa `429` + `Retry-After`, JSON
    `{ error }`. Sayfa görüntüleme sınırlanmaz.
  - **Giriş bağlantısı:** form eylemi e-posta başına 5/saat ve IP başına 20/15 dk; aşılırsa formda
    Türkçe mesaj, e-posta gönderilmez. Auth.js `sendVerificationRequest` içinde e-posta başına
    8/saat yedek sınır (`/api/auth/signin/nodemailer`'a doğrudan istek).
  - **Plan yeniden hesaplama** (motor maliyeti): kullanıcı başına 10/saat (eylem ve API).
- **İstemci IP'si:** `x-forwarded-for`'un ilk değeri. Vercel bu başlığı kendisi yazar (istemcinin
  gönderdiği ezilir); başka bir barındırmada önündeki vekil sunucu aynı şeyi yapmalı. e2e testleri
  tek makineden geldiği için her bağlamda rastgele IP gönderir.

### Güvenlik başlıkları (`apps/web/lib/security-headers.ts`, `next.config.ts → headers()`)

- **CSP nonce'suz:** nonce her istekte yeni olmalı, bu da her sayfayı dinamik yapar ve statik
  kabukları kaybettirir. Next'in satır içi RSC betikleri için `script-src 'self' 'unsafe-inline'`;
  dış betik kaynağı yok. `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`, `form-action 'self' https://accounts.google.com` (Google girişi),
  `img-src` Google profil fotoğrafları. Geliştirmede `'unsafe-eval'` ve HMR için `ws:`.
- **HTTPS:** Vercel http'yi https'e yönlendirir; `Strict-Transport-Security: max-age=2 yıl;
includeSubDomains` (üretim) ve `upgrade-insecure-requests` (`APP_URL` `http://` değilse; yerel
  e2e http'de çalışır). `preload` listesine başvuru alan adı kesinleşince ayrıca düşünülecek.
- Ayrıca `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera, mikrofon,
  konum, ödeme, USB kapalı), `Cross-Origin-Opener-Policy: same-origin`; `X-Powered-By` kapalı.

## Sonuçlar

- `'unsafe-inline'` betik izni XSS'e karşı CSP'nin korumasını zayıflatır; React'in kaçışlaması ve
  `dangerouslySetInnerHTML` kullanılmaması asıl savunmadır. Sıkı CSP gerekirse nonce + dinamik
  sayfalar ya da Next'in deneysel SRI desteği yeniden değerlendirilir.
- Başlıklar build'de sabitlenir; `APP_URL` değişince yeniden deploy gerekir.
- Proxy artık statik dosyalar dışında her istekte çalışır; yazma istekleri ve API için Redis'e bir
  gidiş-dönüş ekler (sayfa görüntülemeye dokunmaz).
- Sentry/PostHog eklenince adresleri `connect-src`'ye (ve gerekirse `script-src`'ye) eklenmeli.
