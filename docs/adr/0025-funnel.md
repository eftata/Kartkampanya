# 0025 — Huni ölçümü (kapalı beta)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Kapı 1 kararı (ROADMAP Sprint 6) şu soruya bağlı: kullanıcılar planı görüyor ve geri dönüyor mu?
Huni: kayıt → kart girdi → planı gördü → 2. hafta geri döndü. PostHog olayları (ADR 0022) takma
adlı ve reklam engelleyiciden etkilenmeyen sunucu olayları olsa da karar verinin kendi
veritabanımızda, PostHog hesabı olmadan da görülebilmesi istendi. "Geri döndü" için kullanıcının
hangi günlerde uygulamayı açtığı bilinmeli; şimdiye kadar bu tutulmuyordu.

## Karar

- **Tanımlar** (`lib/funnel.ts`, saf):
  - Kayıt = açık rızanın ilk verildiği an (onay ekranını geçmeyen hesap kayıt sayılmaz).
  - Kart girdi = `User.firstCardAt` (ilk kart; kart sonra silinse de kalır).
  - Planı gördü = `User.firstPlanViewAt` (plan sayfası başarıyla ilk açıldığında).
  - 2. hafta geri döndü = kayıt günü 0. gün olmak üzere 7–13. günlerden birinde kullanım. Kaydının
       üzerinden 14 gün geçmemiş kullanıcılar paydaya girmez ("henüz ölçülemez").
  - Günler Türkiye takvimi; adminler ve silinmeyi bekleyen hesaplar hariç.
- **Kullanım günleri** `UserActivityDay (userId, day)`: `requireUser` ve `withUser` (onaylı istek)
  yanıttan sonra (`after`) günde bir satır yazar; süreç içi küme aynı gün tekrarını veritabanına
  göndermez. Hangi sayfa, saat ya da işlem tutulmaz. 180 gün saklanır (günlük `purge-accounts`
  işi siler), kullanıcıyla silinir, veri kopyasında yer alır; aydınlatma metnine eklendi
  (sürüm `2026-10-18.3`).
- **Kilometre taşları** yalnızca boşken yazılır (`updateMany ... where null`). Migration mevcut
  kullanıcıların `firstCardAt`'ini duran kartlarından doldurur; `firstPlanViewAt` geriye dönük
  bilinemez (MonthlyPlan haftalık e-posta için de hesaplanır, görüldüğünü kanıtlamaz).
- **Admin** `/admin/huni`: toplam (adım sayısı, önceki adıma ve kayda oran) ve kayıt haftasına
  (pazartesi) göre kohort tablosu.

## Sonuçlar

- Kimliği doğrulanmış her istekte süreç başına günde bir kez veritabanı yazımı; sunucusuz
  ortamda örnek sayısı kadar tekrar olabilir (`skipDuplicates` ile zararsız).
- Hesap tamamen silinince kohorttan da çıkar: geçmiş haftaların oranları zamanla değişebilir.
  Beta ölçeğinde kabul edildi; gerekirse haftalık anlık görüntü saklanır.
- Huni hesaplaması bellekte (tüm uygun kullanıcılar okunur); binlerce kullanıcıda sorguya
  taşınmalı.
