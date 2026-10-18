# 0024 — Kapalı beta geri bildirimi

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Sprint 6: 20–50 davetli kullanıcıdan geri bildirim toplanacak. Dış form servisleri (Google Forms,
Typeform) kullanıcıyı uygulamadan çıkarır, hesapla eşleşmez ve kişisel veriyi üçüncü tarafa
taşır. Yanlış kampanya bildirimi (Faz 2'deki "bu kampanya yanlış") için de ilk adım gerekiyor.

## Karar

- **Model** `Feedback` (kullanıcı, tür `BUG | IDEA | DATA | OTHER`, isteğe bağlı 1–5 puan, mesaj
  ≤ 2000, gönderildiği sayfanın yolu, durum `NEW | READ | DONE`). Kullanıcıyla birlikte silinir
  (KVKK), veri kopyasında (`/api/me/export`) yer alır; aydınlatma metnine eklendi (sürüm
  `2026-10-18.2`).
- **Giriş** `FeedbackInput` (zod, `packages/shared`): mesajda kart numarası reddedilir; sayfa
  yalnızca site içi yol, sorgu dizgisi atılır (imza/belirteç sızmasın).
- **Arayüz:** giriş yapmış kullanıcının üst menüsünde "Geri bildirim" bağlantısı açıldığı sayfayı
  `?sayfa=` ile iletir; `/geri-bildirim` formu (hata alınca değerler korunur) ve kullanıcının
  gönderdikleri, kullanıcıya uygun durum adlarıyla ("Ekip okudu"). API `GET/POST /api/me/feedback`.
- **Sınır:** kullanıcı başına saatte 10 (`RATE_LIMITS.feedback`).
- **Admin:** `/admin/geri-bildirim` gelen kutusu (duruma göre sekmeler, gönderenin e-postası
  `mailto:` ile yanıt için), durum değişikliği `AdminAuditLog`'a (`entityType = "Feedback"`).
  Sistem durumu panosunda yeni geri bildirim sayısı. Analitikte yalnızca `feedback_sent` (tür).

## Sonuçlar

- Yanıtlar uygulama dışından (e-posta) verilir; uygulama içi konuşma yok.
- Yeni geri bildirimde admin'e e-posta bildirimi yok; panodan takip edilir. Gerekirse günlük
  bildirim işine özet eklenir.
- "DATA" türü kampanya kimliği taşımaz; Faz 2'de kampanya detayından bağlamlı bildirim eklenecek.
