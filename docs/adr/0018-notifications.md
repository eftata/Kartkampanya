# 0018 — Bildirim e-postaları

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Sprint 5: katılım hatırlatma (kampanya başlangıcında), son 3 gün uyarısı, haftalık plan özeti.
Bildirimler kullanıcının kendi kartları ve kampanyaları hakkındadır (hizmet bildirimi, pazarlama
değil); yine de her e-posta tek tıkla kapatılabilmeli ve aynı bildirim iki kez gitmemeli.

## Karar

- **Tetikleme:** günlük zamanlanmış iş `GET /api/cron/notifications` (Vercel Cron,
  `apps/web/vercel.json`, 06:00 UTC = 09:00 TR). `Authorization: Bearer CRON_SECRET` (zaman sabit
  karşılaştırma); anahtar yoksa 503. `?weekly=1` haftalık özeti zorlar, `?user=` tek kullanıcı.
- **Kim, ne (`lib/notifications/pick.ts`, saf):** kaynak eşleştirme servisidir (`getMyCampaigns`:
  yalnızca kullanıcıya uyan onaylı kampanyalar).
  - Katılım hatırlatma: katılım gerektiren, başlamış, son katılım günü geçmemiş, katılınmamış.
    Kampanya kullanıcı kaydolmadan önce başladıysa da bir kez gider.
  - Son günler: katıldığın ya da planındaki kampanyanın son 3 günü (bitiş günü dahil).
  - Haftalık özet: Pazartesi, ISO haftası başına bir kez; bu ayın planından (`getMonthlyPlan`).
- **Tek sefer:** gönderim başarılı olunca `NotificationLog`'a (kullanıcı + tür + kampanya id'si ya
  da ISO hafta, tekil) yazılır; gönderilemeyen kaydedilmez, ertesi gün yeniden denenir. Kullanıcı
  başına tür başına tek toplu e-posta.
- **Hedef kitle:** e-postası doğrulanmış, silinmemiş, kartı olan ve en az bir bildirimi açık
  kullanıcılar. Bir kullanıcının hatası diğerlerini durdurmaz; sayılar yanıtta döner.
- **Tercihler:** `User.notifyPrefs` (`joinReminder`, `endingSoon`, `weeklySummary`; varsayılan
  açık, alan alan ayrıştırılır). Tercih ekranı Sprint 5'in sonraki görevi.
- **Abonelikten çıkma:** her e-postada "bu bildirimleri kapat" ve "tüm bildirimleri kapat"
  bağlantıları + `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058 tek tık). Bağlantılar
  oturum istemez; kullanıcı + tür `AUTH_SECRET` ile HMAC imzalıdır (süresiz). Tarayıcı sayfası
  `/abonelik` GET'te kapatmaz (e-posta tarayıcıları bağlantıları önceden açar), onay düğmesi
  ister; tek tık `POST /api/unsubscribe`.
- **Şablonlar** (`templates.ts`, saf): Türkçe düz metin + sade HTML, kullanıcı/kampanya metinleri
  kaçışlı. "Son günler" ve plan özeti "gereksiz harcamaya teşvik etmeyiz" notunu taşır.
- **Bağlantı kökü:** `APP_URL`, yoksa isteğin adresi.

## Sonuçlar

- Hizmet bildirimleri İYS kapsamında pazarlama iletisi sayılmamalı; pazarlama e-postaları
  (ayrı rıza + İYS) ayrı şablon ve ayrı tercih olarak eklenecek. Hukuki teyit KVKK listesinde.
- Kullanıcı sayısı büyürse iş parçalara bölünür (kuyruk) ve SMTP sağlayıcısının hız sınırı
  gözetilir; şimdilik tek istekte sıralı.
