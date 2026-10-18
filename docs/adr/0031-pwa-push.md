# 0031 — PWA ve web push

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Faz 2: kullanıcı KartPlan'ı telefonunda uygulama gibi açabilmeli ve hatırlatmaları (katılım, son
günler, haftalık özet, ay sonu raporu) e-postayı beklemeden almalı. Mağaza uygulaması yok; iOS 16.4+
ana ekrana eklenmiş web uygulamalarında push destekliyor.

## Karar

- **Kurulabilir uygulama:** Next metadata `app/manifest.ts` (`standalone`, başlangıç `/plan`,
  kısayollar), 192/512 PNG ve maskelenebilir simge (`public/icons/`, kaynak `icon.svg`), Apple simgesi
  ve `appleWebApp` meta etiketleri, `themeColor`.
- **Servis çalışanı** `public/sw.js`, kökte `components/service-worker.tsx` ile kaydedilir
  (`updateViaCache: "none"`, `sw.js` yanıtı `no-cache`). Yalnızca `offline.html` ve simge
  önbelleğe alınır; sayfa gezintisi ağdan, ağ yoksa çevrimdışı sayfası. Kişisel sayfa ve API yanıtı
  önbelleğe alınmaz (paylaşılan cihazda veri kalmasın, plan hep güncel olsun).
- **Push kanalı:** e-posta bildirimlerine **ek** kanal; ayrı tercih yok, aynı tür tercihleri ve aynı
  `NotificationLog` tek sefer kaydı geçerli. Şablonlar her e-postanın kısa hâlini (`push`: başlık,
  metin, uygulama içi yol, etiket) üretir; `runNotifications` e-posta başarıyla gidince kullanıcının
  cihazlarına gönderir (push hatası e-postayı geri almaz, tekrar denenmez).
- **Abonelik** `PushSubscription` (cihaz başına; `endpoint` benzersiz, başka hesapla abone olunursa
  kayıt taşınır; kullanıcı başına en fazla 10, eskiler silinir). Açma Profilim'den, tarayıcı izni
  kullanıcı düğmeye basınca istenir (sayfa açılışında izin istenmez). iPhone'da tarayıcıdaysa önce
  ana ekrana ekleme anlatılır.
- **Gönderim** `lib/push.ts`: VAPID (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, çalışma anında okunur;
  üçü yoksa push kapalı), yük RFC 8291 aes128gcm ile uçtan uca şifreli, TTL 1 gün. İstek
  `web-push → generateRequestDetails` ile hazırlanır, `fetch` ile gönderilir (web-push'un kendi
  istemcisi yalnızca https; böylece e2e sahte servisi de http'den çalışır).
- **SSRF:** abonelik adresi kullanıcıdan gelir ve sunucu oraya istek atar. Yalnızca tarayıcıların
  push servisleri kabul edilir (`fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `*.push.apple.com`, `*.notify.windows.com`; https, port ve kullanıcı bilgisi yok), yönlendirme
  izlenmez, 10 sn zaman aşımı. `PUSH_EXTRA_ORIGINS` yalnızca e2e içindir.
- **Bakım:** servis 404/410 dönerse abonelik silinir; tarayıcı aboneliği yenilerse servis çalışanı
  (`pushsubscriptionchange`) sunucuyu günceller. Deneme bildirimi kullanıcı başına saatte 5.
- **KVKK:** abonelik kullanıcıyla silinir; veri kopyasında yalnızca servis adı ve tarihler (adres
  cihaza bildirim göndermeye yarar). Aydınlatma metnine abonelik verisi ve push servisleri eklendi
  (sürüm `2026-10-18.7`). Analitik olayı `push_enabled` (kişisel veri yok).

## Sonuçlar

- e2e gerçek tarayıcı aboneliği yapamaz (başsız Chromium bildirim izni vermez, gerçek push servisine
  çıkılmaz): abonelik API ile sahte servise yapılır, test yükü çözerek içeriği doğrular.
- Push yalnızca e-posta gönderilen kullanıcıya gider (e-postası doğrulanmış, kartı olan). "Yalnızca
  push, e-posta yok" tercihi ileride gerekirse kanal tercihi olarak eklenir.
- Yeni push servisi (ör. yeni tarayıcı) izin listesine eklenmeden o tarayıcıda push açılamaz.
