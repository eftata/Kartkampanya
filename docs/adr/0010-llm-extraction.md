# 0010 — LLM ile kampanya kuralı ayıklama

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Banka kampanya metinleri serbest Türkçe metindir; eşik, ödül, üst limit ve hariç tutulanlar her
bankada farklı yazılır. Kural tabanlı ayrıştırma her banka ve şablon için ayrı bakım ister. ROADMAP
ayıklamayı LLM'e verir: çıktı `CampaignRule[]` JSON'u + güven skoru, pydantic ile doğrulanır,
geçersizse bir kez yeniden denenir. Kategori ve marka serbest metin olmamalı, katalogdan gelmeli.

## Karar

- **Sağlayıcı ve model:** Claude API (`anthropic` Python SDK), varsayılan model `claude-opus-5-5`
  (`LLM_MODEL` ile değişir), `effort: high`. Düşünme bu modelde her zaman açıktır; bütçe
  gönderilmez. Anahtar `ANTHROPIC_API_KEY` (yalnızca motor ortamında).
- **Yapılandırılmış çıktı:** `output_config.format` ile JSON şeması. Şema elle yazılır
  (`output_schema`): kategori slug'ları ve marka adları katalogdan **`enum`** olarak verilir, model
  liste dışı değer üretemez. Desteklenmeyen şema anahtarları (sınır değerleri) şemada yoktur; bunları
  ve alanlar arası kuralları pydantic denetler (`Extraction`, `ExtractedRule`):
  SINGLE/CUMULATIVE → `threshold_kurus`, TXN_COUNT → `txn_count` zorunlu; INSTALLMENT dışındaki
  ödüllerde `reward_kurus` ya da `reward_bps`; `reward_bps` ≤ 10 000; `confidence` 0–1; özet 1–3 madde.
- **Yeniden deneme:** doğrulama hatası (bozuk JSON, kural ihlali, `max_tokens` kesintisi) olursa
  hatalar isteme eklenerek **bir kez** yeniden sorulur (önceki yanıt asistan mesajı olarak geri
  gönderilmez; tek kullanıcı mesajı). İkinci kez de geçersizse `ExtractionError`: kampanya bu
  çalıştırmada yazılmaz, hata `PipelineRun.errors`'a düşer, ertesi gün yeniden denenir.
- **Ret:** sunucu tarafı yedek model açık (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`): istek reddedilirse API aynı isteği önerilen yedek modelle
  yeniden çalıştırır. Zincirin tamamı reddederse (`stop_reason = refusal`) yeniden denenmez.
- **API hataları:** 429/5xx/bağlantı hatalarını SDK kendisi yeniden dener; kalan hata
  `ExtractionError` olur.
- **Bilinmeyen marka:** istem, listede olmayan markayı `merchants`'a değil
  `uncertain_fields`'a `merchant:<Ad>` olarak yazmasını ister; admin kataloğa ekler.
- **İstem güvenliği:** banka sayfası güvenilmeyen veridir; `<kampanya_metni>` etiketi içinde verilir
  ve içindeki talimatların uygulanmaması istenir. Çıktı şemayla kısıtlıdır ve her sonuç `DRAFT`'tır;
  yayın admin onayıyla olur. Metin 40 000 karakterde kesilir.
- **Önbellek:** sistem istemi her kampanyada aynıdır, `cache_control` ile önbelleğe alınır.
- **Test edilebilirlik:** model çağrısı `LlmClient` protokolünün arkasındadır. Testler sahte
  istemci kullanır; istek biçimi gerçek SDK + sahte HTTP katmanıyla (`httpx2.MockTransport`)
  doğrulanır. Testler ağa ve gerçek API'ye çıkmaz.

## Sonuçlar

- Ayıklama sonucu (`ExtractionResult`) katalog id'lerine çevrilmiş kuralları taşır; `Campaign` +
  `CampaignRule` olarak yazılması veri hattının kayıt adımıdır.
- Doğruluk, Sprint 2'deki 30 kampanyalık elle etiketlenmiş test setiyle ölçülecek (hedef: eşik ve
  ödül alanlarında ≥ %85). Gerekirse model/effort ayarı bu ölçüme göre değişir.
- Her ayıklama ücretli bir API çağrısıdır; değişiklik tespiti (ADR 0009) aynı metni yeniden
  göndermez.
