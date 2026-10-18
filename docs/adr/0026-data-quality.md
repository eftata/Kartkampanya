# 0026 — Kampanya veri doğruluğu: onay kontrolleri, hata bildirimi, kaybolan kampanyalar

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Sprint 6: kampanya veri doğruluğu. Planın değeri kampanya verisinin doğruluğuna bağlı; yanlış bir
eşik ya da ödül kullanıcıya gereksiz harcama yaptırabilir. Hatalar üç yerden gelir: LLM ayıklaması
(ADR 0010), admin'in elle düzenlemesi ve bankanın kampanyayı sonradan değiştirmesi/kaldırması.
Henüz gerçek veri ve beta geri bildirimi yok; bu yüzden hataları erken yakalayan ve görünür kılan
mekanizmalar kuruldu.

## Karar

- **Onay öncesi kontroller** (`lib/campaign-checks.ts`, saf; formda canlı, sunucuda onayda tekrar):
  - **Hata (onay engellenir, taslak kaydedilebilir):** son katılım tarihi bitişten sonra; sabit
    ödül eşiğe eşit ya da büyük; üst limit tek kademenin ödülünden küçük; eşik 0 iken kademe
    tekrarı (sınırsız ödül).
  - **Uyarı:** ödül eşiğin yarısından fazla (bir sıfır eksik/fazla olabilir); oran %20'den yüksek;
    tekrarlanan kademede ya da oransal ödülde üst limit yok; kural kategorisiz/markasız (tüm
    harcamalar); otomatik katılımda son katılım tarihi; 120 günden uzun süre; iki aydan uzak başlangıç.
  - Eşikler sabit ve sezgiseldir; gerçek kampanyalarla yanlış alarm oranına göre ayarlanacak.
- **Mükerrer adayı** (`findSimilarCampaigns`): aynı programda, tarihleri çakışan, başlık kelime
  benzerliği ≥ 0,6 olan taslak/onaylı kampanyalar admin kampanya sayfasında listelenir (aynı
  kampanya hem veri hattından hem elle girilmiş olabilir). Engellemez.
- **Kullanıcı hata bildirimi:** kampanya detayında "Bu kampanyada yanlış bir bilgi mi var?" →
  geri bildirim formu kampanya bağlamıyla ("yanlış bilgi" türü seçili). `Feedback.campaignId`
  (kampanya silinirse boşalır); yalnızca onaylı/süresi dolmuş kampanyaya bağlanabilir. Açık
  bildirimler admin kampanya sayfasında ve sistem panosunda görünür.
- **Kaynakta kaybolan kampanyalar:** yayındaki bir kampanya, kaynağının son başarılı taramasından
  36 saatten fazla önce görüldüyse panoda "kaynakta artık görünmüyor" olarak listelenir (banka
  kaldırmış ya da erken bitirmiş olabilir). Otomatik yayından kaldırma yapılmaz; karar admin'in.

## Sonuçlar

- Kontroller şemadan (zod) ayrı: şema "geçerli mi", kontroller "makul mü" sorusunu yanıtlar.
  Aynı kuralların veri hattında (pydantic) karşılığı yok; LLM çıktısı taslak kaldığı için admin
  onayında yakalanması yeterli.
- Kaybolan kampanya tespiti adaptörler çalışmaya başlayınca anlam kazanır (şu an kaynak yok).
