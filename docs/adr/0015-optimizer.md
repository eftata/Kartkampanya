# 0015 — Optimizasyon motoru (CP-SAT) ve plan sözleşmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Sprint 4: kullanıcının aylık harcamasını kartlarına, kampanya eşikleri, kademeleri, üst limitleri ve
kart limitleriyle en çok kazandıracak biçimde dağıtmak. Motor durumsuzdur (`PlanRequest` →
`PlanResponse`); web çağırır. Sözleşme iki dilde (TypeScript, Python) tek kaynaktan gelmeli.

## Karar

- **Sözleşme hattı:** zod (`packages/shared/src/plan.ts`) → JSON Schema
  (`packages/shared/schema/plan-*.schema.json`, `planJsonSchemas()`) → pydantic
  (`services/engine/engine/optimizer/contract/*.py`, datamodel-code-generator). Tek komut:
  `pnpm plan:gen`. Üretilen dosyalar commit'lenir; iki test senkronu denetler (TS: JSON Schema =
  zod çıktısı; Python: modeller = JSON Schema'dan yeniden üretilen). Üretimde zod'un nullable
  `anyOf` biçimi `type: [X, "null"]`'a indirgenir ve kimlik listelerindeki öğe uzunluk kısıtı yalnızca
  Python tarafında düşer (aksi halde üretici RootModel sarmalayıcıları üretiyor; kısıtı web uygular).
  ROADMAP örneğine eklenen alanlar: `txnCount`, `rewardBps` (isteğe bağlı), yanıtta
  `unallocated` ve `baseline.card`; `options` isteğe bağlı (varsayılan maxCards 3, 2000 ms).
- **Model (`cpsat.py`):** değişkenler TL tamsayı (`x[kategori, kart]`); kuruş artıkları çözümden
  sonra kategorinin en büyük payına eklenir. Kısıtlar: kategori bütçesi, kart limiti, `maxCards`
  (kart kullanım ikili değişkeni), harcamanın limitlerin izin verdiği kadarının tamamı dağıtılır.
  Kampanya: kapsam harcaması `s`; toplam eşik (tekrarlı → kademe tamsayısı `t·T ≤ s`), tek seferlik
  eşik (bir kategori-kart harcaması eşiği geçmeli), işlem adedi (harcama varsa tuttu sayılır),
  eşiksiz; sabit + oransal ödül, üst limit. Amaç 1/100 kuruş biriminde; eşit kazançlı çözümlerde
  daha az kategori-kart çifti seçilir (ana hedef çift sayısından büyük katsayıyla çarpılır).
- **Kesin değerlendirme (`problem.py`):** kullanıcıya gösterilen her sayı CP-SAT'ın amaç değeri
  değil, dağılımın kuruş cinsinden aşağı yuvarlanmış yeniden hesabıdır. Kampanya ödülleri katkı
  veren harcamalara tutar oranında bölünür (toplam korunur).
- **Varsayımlar:** aynı harcama birden çok kampanyaya sayılır (senaryo 6; ileride `stackable`);
  bütçenin tamamı harcanır, limit yetmezse `unallocated`; tek kart kıyası (`baseline`) yalnızca
  bütçenin tamamını taşıyabilen kartlarla yapılır.
- **Süre ve yedek:** CP-SAT `timeLimitMs` (varsayılan 2 sn), 8 iş parçacığı; süre içinde optimum
  → `OPTIMAL`, çözüm var ama kanıt yok → `FEASIBLE`, çözüm yok → açgözlü yerel arama (`greedy.py`,
  `FALLBACK`).
- **Yakın kaçanlar (`nearMisses`):** sonraki kademeye eksik tutar ve ek ödül; bütçeyi aşan eşik de
  listelenir (senaryo 3). Arayüz "gereksiz harcamaya teşvik etmeyiz" notuyla gösterir.
- **API:** `POST /optimize` (ENGINE_TOKEN ile korunan router).

## Sonuçlar

- 10 kabul senaryosu `tests/test_optimizer.py`'de. Senaryo 1 (ürün dokümanı, 665 TL) için ROADMAP
  yalnızca K1 ve K4'ü veriyor; K2 ve K3 ROADMAP'teki tüm sonuçlarla tutarlı bir **yeniden kurgu**.
  Ürün dokümanındaki asıl değerler gelince test güncellenmeli.
- Performans: 8 kart / 15 kategori / 120 kampanya bu ortamda (8 çekirdek) 0,5–1,5 sn'de optimum.
  Daha az çekirdekli sunucuda süre dolarsa `FEASIBLE` döner.
- OR-Tools imaja ~30 MB ekler.
