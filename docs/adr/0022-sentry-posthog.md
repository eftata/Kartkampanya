# 0022 — Hata takibi (Sentry) ve ürün analitiği (PostHog)

- **Durum:** Kabul edildi (KVKK değerlendirmesi hukuki incelemeyi bekliyor)
- **Tarih:** 2026-10-18

## Bağlam

Sprint 5: hata takibi ve ürün analitiği; Sprint 6 huni ölçümü (kayıt → kart → plan → 2. hafta
dönüşü). Kural: analitik araçlarına kişisel veri (e-posta, ad) gönderilmez. Uygulama finansal
profil (kartlar, harcama tutarları) tutar; bunlar da dışarı çıkmamalı. Her iki servis yurt dışında.

## Karar

### Sentry (yalnızca hatalar)

- **Web:** `instrumentation.ts` (sunucu; `onRequestError = captureRequestError` ile sayfa, route
  handler, Server Action ve proxy hataları) ve `instrumentation-client.ts` (tarayıcı). **Motor:**
  `engine/telemetry.py` (`init_sentry`; API ve günlük veri hattı işi).
- `sendDefaultPii: false`, performans izleme ve oturum kaydı kapalı (`tracesSampleRate: 0`),
  motorda yerel değişkenler ve istek gövdesi gönderilmez (plan isteğindeki tutarlar).
- `beforeSend` / `before_send` (`lib/telemetry/scrub.ts`, `engine/telemetry.py`): kullanıcı,
  çerez, başlık ve gövde silinir; adreslerin sorgu dizgisi izin listesi dışında atılır (giriş
  bağlantısı belirteci, abonelik imzası); mesaj, istisna ve breadcrumb metinlerindeki e-postalar ve
  12+ haneli rakam dizileri maskelenir.
- `withSentryConfig` kullanılmıyor (kaynak haritası yükleme yok, build ağa çıkmaz). Gerekirse
  `SENTRY_AUTH_TOKEN` ile sonradan eklenir.

### PostHog

- **Tarayıcı** (`instrumentation-client.ts`): yalnızca anonim sayfa görüntüleme
  (`capture_pageview: "history_change"`). `persistence: "memory"` — çerez ya da yerel depolama
  yok, her sekme ayrı ziyaret; `person_profiles: "never"`, kimlik bağlanmaz. Otomatik tıklama
  yakalama, oturum kaydı, anketler, deneyler, bayraklar ve dış betik yükleme kapalı.
  `before_send` adresleri ve metinleri temizler, `$ip`'yi siler. IP sunucuya yine ulaşır: projede
  **"Discard client IP data"** açık olmalı. AB sunucusu (`eu.i.posthog.com`).
- **Sunucu** (`lib/analytics.ts → track`): kullanıcıya bağlı huni olayları capture API'sine
  `after()` ile (yanıtı geciktirmez, hata kullanıcıyı etkilemez): `user_signed_up` (ilk KVKK onayı;
  açık rızadan önce olay gitmez), `card_added`, `spend_profile_saved`, `plan_viewed`,
  `campaign_joined`. Kimlik `analyticsId` = HMAC-SHA256(AUTH_SECRET, kullanıcı id) — PostHog'daki
  kimlik veritabanımızla bizim anahtarımız olmadan eşlenemez. Özellikler yalnızca sayı/etiket (kart
  sayısı, ay, plan durumu); tutar yok. `$geoip_disable`.
- Servisler `NEXT_PUBLIC_*` değişkenleri boşsa hiç başlatılmaz; paketler dinamik import edilir
  (kapalıyken tarayıcı paketine eklenmez). CSP `connect-src` yapılandırılan kökenleri build'de alır.
- **Metinler:** aydınlatma metnine hata kayıtları ve kullanım istatistikleri, açık rıza metnine
  "hata takibi ve kullanım istatistiği sağlayıcıları" eklendi; sürüm `2026-10-18` (kullanıcılar
  yeniden onaylar).

## Sonuçlar

- Giriş yapmamış ziyaretçinin anonim sayfa görüntülemesi açık rıza olmadan yurt dışındaki
  PostHog'a gider (adres parametresiz, çerezsiz, IP saklanmadan). Bunun meşru menfaat kapsamında
  kalıp kalmadığı hukuki incelemede değerlendirilmeli; gerekirse tarayıcı analitiği yalnızca onay
  vermiş kullanıcılara açılır (`instrumentation-client.ts` tek yer).
- Hesap silindiğinde PostHog'daki takma adlı olaylar silinmez (kişiyle eşlenemez); saklama süresi
  PostHog proje ayarından sınırlanmalı. Gerekirse silmede `analyticsId` ile PostHog kişi silme
  API'si çağrılır.
- e2e sahte bir PostHog toplayıcısıyla (`e2e/fake-posthog.mjs`) çalışır ve olaylarda e-posta,
  giriş belirteci ya da izin dışı parametre olmadığını doğrular. PostHog otomasyon tarayıcısını bot
  sayar; test `navigator.webdriver` ve `userAgentData`'yı gizler.
