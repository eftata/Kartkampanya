# Ayıklama test seti

LLM ayıklamasının doğruluğunu ölçen, **elle etiketlenmiş** kampanya seti (ROADMAP Sprint 2: 30
kampanya, eşik ve ödül alanlarında ≥ %85). Araç: `python -m engine.evaluation` (ADR 0013).

```
eval/
├─ catalog.json        # etiketlerde kullanılabilecek kategori slug'ları ve marka adları
├─ cases/<id>.json     # vaka: ham metin + beklenen kurallar
├─ predictions.jsonl   # son `run` çıktısı (yeniden puanlamak için; API çağırmaz)
└─ report.md           # son doğruluk raporu
```

## Seti oluşturma

Gerçek banka metinleri gerekir; vaka uydurulmaz.

1. Veri hattı gerçek kampanyaları çeksin (`python -m engine.pipeline`), admin onay kuyruğunda
   (`/admin/kampanyalar`) **her alanı kaynak sayfayla karşılaştırarak** düzeltip onaylasın.
   LLM'in önerisini onaylamak etiketlemek değildir: eşik, ödül, üst limit, tekrar ve hariçler tek
   tek metinden doğrulanır.
2. `pnpm engine:eval export --limit 30` → onaylı kampanyalar `cases/` altına yazılır
   (`labeled_by: "admin"`). Var olan dosyalar ezilmez; `--force` ile ezilir.
3. Çeşitlilik: en az 2 program; tek seferlik/toplam/işlem adedi eşikleri, puan/iade/indirim/taksit
   ödülleri, birden çok kademeli kampanyalar ve "kampanya kapsamı dışı" maddeleri olanlar.
4. Çapalanmayı ölçmek için vakaların bir kısmını (öneri: ≥ 10) LLM çıktısını görmeden **sıfırdan**
   etiketle: dosyayı aşağıdaki biçimde elle yaz, `labeled_by: "elle"`.

## Çalıştırma

```bash
pnpm engine:eval run     # her vaka için Claude API çağrısı (ücretli; ANTHROPIC_API_KEY gerekir)
pnpm engine:eval score   # kayıtlı tahminleri yeniden puanla (prompt değişmediyse yeterli)
```

Rapor `eval/report.md`'ye yazılır; çıkış kodu 0 = hedef tuttu, 1 = tutmadı, 2 = set/tahmin yok.
Prompt, model ya da şema değiştiğinde `run` yeniden çalıştırılır ve rapor commit'lenir.

## Puanlama

- Kurallar sıradan bağımsız eşlenir. Eksik kuralın ve fazladan üretilen kuralın her alanı hatadır.
- Kabul ölçütü (★): eşik türü, eşik tutarı, işlem adedi, eşik tekrarı, ödül türü, ödül tutarı,
  ödül oranı, üst limit. Kategori, marka, hariçler ve katılım bilgisi ayrıca raporlanır.
- Ayıklaması başarısız (ret, iki kez geçersiz çıktı) vakanın bütün alanları hatadır.

## Vaka biçimi

Tutarlar kuruş (`250000` = 2.500 TL), oranlar baz puan (`500` = %5). Kategori/marka
`catalog.json`'daki değerlerden seçilir.

```json
{
  "id": "bonus-markette-2-500-tl-ye-100-a1b2c3",
  "source_url": "https://…",
  "title": "Markette 2.500 TL'ye 100 TL bonus",
  "starts_at": "2026-11-01",
  "ends_at": "2026-11-30",
  "raw_text": "…sayfadaki şart metni…",
  "expected": {
    "join_method": "APP",
    "join_deadline": "2026-11-30",
    "rules": [
      {
        "categories": ["market"],
        "merchants": [],
        "threshold_type": "CUMULATIVE",
        "threshold_kurus": 250000,
        "txn_count": null,
        "tier_repeat": true,
        "reward_type": "POINTS",
        "reward_kurus": 10000,
        "reward_bps": null,
        "cap_kurus": 30000,
        "exclusions": ["taksitli"]
      }
    ]
  },
  "labeled_by": "elle",
  "synthetic": false,
  "notes": ""
}
```
