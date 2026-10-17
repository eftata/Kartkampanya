# 0007 — Kampanya şeması

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Sprint 2 veri hattı bankaların kampanya sayfalarını tarar, LLM ile kurallara ayırır ve sonucu
`DRAFT` olarak yazar; admin onaylayınca kampanya yayına girer. Python veri hattı bu tablolara
doğrudan okur/yazar, ama şemanın sahibi Prisma'dır (ADR 0001). ROADMAP taslağında
`CampaignSource` tanımlı değildi.

## Karar

- **`CampaignSource`:** bir programın kampanya listesi kaynağı; her banka adaptörü bir kayıttır
  (`adapter` tekil: `services/engine/engine/pipeline/adapters/<adapter>.py`, `listUrl`, `active`).
  Kampanya ve her çalıştırma (`PipelineRun`) kaynağa bağlanır; admin bir kaynağı kapatabilir.
  Kaynak kayıtları seed'e girmez: liste adresleri doğrulanmamış bilgi olurdu. Adaptörler kendi
  adreslerini koddan bilir ve ilk çalıştırmada kaynak kaydını oluşturur (Sprint 2, adaptör görevi).
- **Kart kapsamı ara tablo (`CampaignCard`):** taslaktaki `cardScope String[]` yerine. Boş kapsam
  "programdaki tüm kartlar" demek; metin dizisinde silinen bir kartın kimliği sessizce kopar ve
  kampanyayı yanlışlıkla tüm kartlara açabilirdi. Ara tabloda kart ürünü silinemez (`Restrict`);
  admin panelindeki silme de bunu Türkçe hatayla bildirir.
- **Pipeline alanları:** `rawHash` (başlık + tarih + metin özeti, ADR 0009; aynıysa yeniden ayıklama yok), `lastSeenAt` (kaynak
  listesinden kalkan kampanyayı fark etmek için), `uncertainFields` (LLM'in emin olmadığı alanlar;
  onay kuyruğunda vurgulanır), `confidence` (0–1; para değil, `Float`).
- **`PipelineRun`:** `adapter` metni yerine `sourceId` ilişkisi ve `status`
  (`RUNNING`/`SUCCEEDED`/`FAILED`); yarıda kalan çalıştırma `RUNNING` olarak görünür.
- **Silme davranışı:** kampanya silinince kuralları ve kapsamı silinir; kampanyası veya kaynağı olan
  program, çalıştırması olan kaynak silinemez; kaynak silinirse kampanyalar kalır (`sourceId` boşalır).
- **`CampaignRule.categoryIds` / `merchantIds`** taslaktaki gibi kimlik dizisidir (yabancı anahtar
  yok): LLM katalogdaki listeden seçer, geçersiz kimlik `uncertainFields`'e düşer; uygulama katmanı
  doğrular.
- `UserCampaignStatus` (Sprint 3) ve `MonthlyPlan` (Sprint 4) kendi sprintlerinde eklenecek.

## Sonuçlar

- Python tarafı bu tablolara yazarken Prisma'nın ürettiği sütun adlarını (çift tırnaklı
  camelCase) ve `CampaignCard` ara tablosunu kullanır; şemayı değiştirmez.
- Onay kuyruğundaki onay/ret işlemleri `AdminAuditLog`'a `entityType = "Campaign"` ile yazılmalı.
