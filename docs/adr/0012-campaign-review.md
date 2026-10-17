# 0012 — Admin onay kuyruğu

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Veri hattı her kampanyayı `DRAFT` yazar (ADR 0011); kullanıcıya görünmesi admin onayına bağlıdır.
Admin, LLM'in ayıkladığı kuralları ham metinle karşılaştırıp düzeltebilmeli, onaylayabilmeli ya da
reddedebilmeli; her karar işlem kaydına girmeli (güvenlik listesi: "kim neyi onayladı").

## Karar

- **Sayfalar:** `/admin/kampanyalar` kuyruk (sekme: bekleyen / onaylanan / reddedilen / süresi
  dolan; bitişi en yakın en üstte; LLM güveni ve belirsiz alan sayısı görünür).
  `/admin/kampanyalar/[id]`: solda ham metin, sağda düzenleme formu. LLM'in `uncertain_fields`
  listesi sarıyla işaretlenir; `merchant:<Ad>` katalogda olmayan marka olarak ayrıca gösterilir.
- **İşlemler:** tek uç `PUT /api/admin/campaigns/{id}` (+ aynı işi yapan server action'lar),
  gövde `AdminCampaignReview`:
  - `save`: alanlar, kurallar ve kart kapsamı kaydedilir; **durum değişmez** (onaylı kampanyada
    düzeltme yayında kalır, kayda geçer).
  - `approve`: kaydet + `APPROVED`. Bitiş tarihi geçmiş kampanya onaylanamaz.
  - `reject`: `REJECTED`, opsiyonel gerekçe kayda yazılır. Metin değişirse veri hattı kampanyayı
    yeniden `DRAFT` yapar.
- **Kurallar ve kart kapsamı bütünüyle değiştirilir** (sil + ekle); referanslar transaction içinde
  denetlenir: kart kampanyanın programında olmalı, kategori ve markalar var olmalı.
- **Doğrulama:** alanlar arası kurallar (`CampaignRuleInput`) veri hattındaki pydantic modeliyle
  aynıdır: SINGLE/CUMULATIVE → eşik tutarı, TXN_COUNT → işlem adedi, taksit dışı ödülde tutar ya da
  oran; oran ≤ %100; bitiş ≥ başlangıç; 1–3 özet maddesi; 1–20 kural.
- **Form:** istemci metin tutar (TL, yüzde); sunucu `draftToInput` ile kuruş/bps'ye çevirip zod ile
  doğrular, hatayı "Kural 2 · Üst limit: …" biçiminde döner; hata alınca girilenler korunur.
- **İşlem kaydı:** `campaign.update` / `campaign.approve` / `campaign.reject`, `entityType =
"Campaign"`; yalnızca değişen alanlar, kurallar ve kart kapsamı önce/sonra olarak yazılır.
  Kayıt yardımcıları `lib/admin-audit.ts`'e taşındı (katalog ve kampanya ortak).
- **Tarih:** form/API "YYYY-AA-GG"; veritabanında UTC gece yarısı (veri hattıyla aynı).

## Sonuçlar

- Admin'in düzelttiği kurallar, kampanya metni değişince veri hattının yeni ayıklamasıyla ezilir;
  kampanya yeniden onaya düşer (bilinçli: metin değiştiyse kurallar da değişmiş olabilir).
- Onaylı kampanyaların kullanıcıya gösterimi ve süresi dolanların `EXPIRED` yapılması Sprint 3'te.
