# 0014 — Kişisel kampanya eşleştirme

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Sprint 3 kabulü: kullanıcı yalnızca kendi kartlarına ve harcama alanlarına uyan kampanyaları
görür. Liste ayrıca tahmini kazanca göre sıralanabilmeli. Gerçek dağıtım (hangi harcama hangi
kartla) Sprint 4'ün optimizasyon motorunun işi; burada her kampanya tek başına değerlendirilir.

## Karar

- **Katmanlar:** kurallar saf modülde (`lib/campaign-match.ts`, veritabanısız, birim testli);
  veri okuma `lib/campaigns.ts → getMyCampaigns`; API `GET /api/me/campaigns?card=&category=&type=&sort=`.
- **Aktif:** `APPROVED`, bitiş günü bugün ya da sonrası, son katılım tarihi geçmemiş. "Bugün"
  Türkiye takvimi (UTC+3). Henüz başlamamış kampanyalar listelenir (`upcoming`).
- **Kart:** kullanıcının kampanyanın programında kartı olmalı; kart kapsamı (`CampaignCard`) doluysa
  o kartlardan biri. Uyan kartlar DTO'da döner (filtre: `card` = `UserCard.id`).
- **Alan:** kural kategorileri ve markaları **ana kategoriye** indirgenir (alt kategori → kök,
  marka → kategorisinin kökü); kullanıcının harcama profilindeki ana kategorilerle kesişmeli.
  Kategorisiz ve markasız kural tüm harcamalara uyar. En az bir kural uymalı.
- **Kaba tahmin (`estimateKurus`):** uyan kuralın kategorilerindeki aylık harcama × kalan gün/30.
  Toplam eşik: harcama eşiği geçiyorsa ödül (tekrarlıysa eşik kadar kez); tek seferlik eşik: aylık
  harcama eşiği geçiyorsa bir kez; işlem adedi: harcama varsa tuttu sayılır; oransal ödül harcama ×
  oran; üst limit uygulanır; taksit ödülü 0. Kampanyanın tahmini uyan kuralların **en yükseği**
  (kademeli kurallar toplanmaz). Harcama kampanyalar arasında bölüştürülmez: bu bir sıralama
  ipucudur, plan değildir.
- **Etiket alanları:** `joinRequired` (katılım AUTO değil), `endingSoon` (son 7 gün), `upcoming`.
  "Plana dahil" etiketi `UserCampaignStatus` ile gelecek.

- **Sayfa:** `/kampanyalarim` sunucuda `getMyCampaigns`'i çağırır; filtreler URL'de Türkçe
  parametrelerle durur (`kart`, `kategori`, `tur`, `sirala`; `lib/campaign-filters.ts`), bilinmeyen
  değerler yok sayılır. Form `next/form` ile seçim değişince istemci tarafında gezinir.

## Sonuçlar

- Eşleştirme istek anında hesaplanır (kullanıcı başına birkaç sorgu); kampanya sayısı büyürse
  önbellek ya da önceden hesaplama düşünülür.
- Puan ödülleri kuruş (TL karşılığı) olarak saklandığı için program puan değeriyle çarpılmaz;
  veri hattı ödülü TL karşılığı olarak ayıklar.
