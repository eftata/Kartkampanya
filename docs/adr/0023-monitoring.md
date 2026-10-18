# 0023 — İzleme: durum ucu, iş kayıtları, admin panosu

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Sprint 6 (kapalı beta): production ortamı, yedekleme ve izleme panosu. Barındırma hesaplarına
(Vercel, Railway) bu oturumdan erişilemiyor; kod tarafı, dışarıdan izlenebilecek uçlar ve işletim
belgesi hazırlanır. Günlük işlerin (bildirim e-postaları, hesap temizliği, veri hattı) sessizce
durması en olası arıza: Vercel Cron başarısız çağrıyı yeniden denemez.

## Karar

- **`GET /api/status`** (herkese açık): veritabanı (basit sorgu), Redis (`PING`; yapılandırılmamışsa
  `disabled`), motor (`/health`, 3 sn) → `{ status: ok|degraded|down, checks }`. Veritabanı ya da
  motor yoksa 503 (dış uptime izleyici uyarır); Redis yoksa `degraded` (istek sınırı açık
  başarısızlıkla çalışır, ADR 0021). Adres, sürüm ya da hata ayrıntısı dönmez. proxy'nin genel
  istek sınırına tabidir. `/api/health` yalnızca canlılık olarak kalır.
- **`JobRun`** modeli ve `recordJob(name, run)` (`lib/jobs.ts`): web cron işleri başta RUNNING,
  sonunda SUCCEEDED + özet (yalnızca sayılar) ya da FAILED + temizlenmiş hata (e-posta maskelenir);
  hata Sentry'ye `job` etiketiyle gider. Tek kullanıcılık elle denemeler (`?user=`) kaydedilmez.
  Veri hattı zaten `PipelineRun` yazar.
- **Gecikme kuralı** (`lib/system-health.ts`, saf): son çalışma 26 saat içinde başarılı değilse
  "Gecikti", FAILED ise "Başarısız", 1 saatten uzun RUNNING ise "Takıldı", kayıt yoksa "Hiç
  çalışmadı". Günlük işlerin saat kaymasına 2 saat pay.
- **Admin panosu** `/admin/durum`: bileşenler (süreyle), işler + aktif veri hattı kaynakları,
  onay kuyruğu (en eski taslak), yayındaki ve 7 gün içinde biten kampanyalar, kullanıcı ve silinmeyi
  bekleyen hesap sayısı, son 24 saatte gönderilen e-postalar (türe göre) ve hesaplanan planlar.
  Kişisel veri yok.
- **İşletim belgesi** `docs/operations.md`: production/staging ayrımı, yedek ve geri yükleme
  tatbikatı, uptime izleyici ve Sentry uyarıları. Yedekler Railway'de kalır (kişisel veri; GitHub
  gibi yerlere kopyalanmaz).

## Sonuçlar

- Uyarıların kendisi (uptime izleyici, Sentry kuralları) hesap tarafında kurulmalı; kurulana kadar
  pano yalnızca bakıldığında işe yarar.
- `/api/status` her çağrıda veritabanına ve motora gider; izleyici aralığı 1 dk'nın altına
  indirilmemeli.
- Panodaki sayılar anlık sorgudur; trafik artarsa önbelleğe alınabilir.
