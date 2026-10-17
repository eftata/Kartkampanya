# 0017 — Aylık planın saklanması ve yeniden hesaplanması

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Plan her açılışta motoru çağırıyordu (ADR 0016). ROADMAP: plan `MonthlyPlan` olarak saklanmalı,
profil veya kampanya değişince yeniden hesaplanmalı; "plana dahil" etiketi plandan beslenmeli.
Değişiklik kaynakları çok: kart ekleme/kaldırma, limit, harcama profili, kampanya onayı/düzenleme,
süre dolması, katılım işareti, katalog oranları.

## Karar

- **Kayıt:** kullanıcı + ay başına tek `MonthlyPlan` satırı (`@@unique([userId, month])`): girdi
  (`PlanRequest`), sonuç (`PlanResponse`), beklenen ve tek kart tutarı, `computedAt`. Geçmiş ayların
  son planı kalır (Faz 2'de gerçekleşen kazançla karşılaştırma için `realizedKurus`).
- **Ne zaman yeniden hesaplanır — olay değil içerik:** her istekte plan girdisi veritabanından
  yeniden kurulur (birkaç sorgu, motor yok) ve **kanonik özeti** (`inputHash`, anahtarları sıralı
  JSON'un sha256'sı; sorgular sıralı) kayıtlıyla karşılaştırılır. Aynıysa kayıtlı sonuç döner;
  farklıysa motor çağrılır ve kayıt güncellenir. Böylece değişiklik yolu ne olursa olsun (admin
  düzenlemesi, süre dolması, kullanıcı işlemi) plan güncel kalır; ayrı tetikleyiciler unutulamaz.
- **"Plana dahil":** her yeni hesaplamada aynı işlemde planın ödül aldığı kampanyalar
  `UserCampaignStatus.inPlan = true`, kullanıcının diğerleri false.
- **Motor erişilemezse:** kayıt varsa son plan `stale` olarak, sayfada uyarıyla gösterilir; yoksa
  hata.
- **API:** `GET /api/me/plan?month=` (bu ay: kayıtlı ya da hesaplanır; başka ay: yalnızca kayıtlı,
  yoksa 404; eksik onboarding 409, motor hatası 503), `POST /api/me/plan/recompute` (özet aynı
  olsa da hesaplar). Yanıt `MonthlyPlanDto` (`packages/shared`). Sayfada "Yeniden hesapla".

## Sonuçlar

- Motor yalnızca girdi değişince çağrılır; algoritma değişirse (aynı girdi, farklı sonuç) kayıtlı
  planlar "Yeniden hesapla" ile ya da girdi değişince güncellenir.
- Plan sayfası her açılışta birkaç sorgu çalıştırır; ölçek büyürse girdi kurulumu önbelleğe alınır.
