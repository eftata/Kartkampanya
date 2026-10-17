# 0011 — Ayıklanan kampanyaların kaydı ve günlük iş

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Değişiklik tespiti (ADR 0009) yeni ve değişen kampanyaları `pending` olarak döndürüyordu; LLM
ayıklama (ADR 0010) bir kampanyanın kurallarını üretiyordu. İkisini bağlayıp `Campaign` +
`CampaignRule` satırlarını `DRAFT` olarak yazan ve günde bir çalışan bir iş gerekiyordu. ADR 0009'da
değişen kampanyanın yeni metni ve özeti hemen yazılıyordu: ayıklama başarısız olursa ertesi gün özet
aynı görünecek, kampanya "değişmedi" sayılıp **hiç yeniden ayıklanmayacaktı**.

## Karar

- **`run_source(adapter, fetcher, store, llm)`** tek adımda: liste → detay → değişiklik tespiti →
  ayıklama → kayıt → `PipelineRun`. Katalog çalıştırma başına bir kez okunur.
- **Değişen kampanya:** `mark_changed` yalnızca `status = DRAFT` yapar (yayından hemen kalkar).
  Yeni metin, özet (`rawHash`), tarih ve ayıklama alanları `save_extraction` ile kurallarla **aynı
  işlemde** yazılır; eski kurallar silinip yenileri eklenir. Ayıklama başarısızsa özet eski kalır,
  kampanya ertesi gün yine "değişti" sayılır ve yeniden denenir. (ADR 0009'daki "yeni metin hemen
  yazılır" kararının yerini alır.)
- **Yeni kampanya:** ilk yazım ayıklamadan sonradır (`joinMethod` gibi zorunlu alanlar). Tarih
  aralığı okunamayan yeni kampanya LLM'e gönderilmez, hata olarak kaydedilir (ücretli çağrı boşa
  gitmesin; düzeltilmesi gereken adaptördür). Var olan kampanyada okunamayan tarih eskisini korur.
- **Hatalar:** sayfa alınamaması, tarih eksikliği ve `ExtractionError` çalıştırmayı durdurmaz;
  `PipelineRun.errors`'a `{url, message}` olarak düşer. `PipelineRun.changed` = bu çalıştırmada
  ayıklanıp yazılan kampanya sayısı.
- **Kart kapsamı** (`CampaignCard`) LLM'den gelmez: boş = programdaki tüm kartlar; admin onay
  kuyruğunda daraltır.
- **Günlük iş:** `python -m engine.pipeline [adaptör ...]` (ad verilmezse kayıtlı tümü;
  `adapters/` altındaki modüller otomatik içe aktarılır). Çıkış kodu 0 / 1 (bir kaynağın listesi
  alınamadı) / 2 (bilinmeyen adaptör). Zamanlama dağıtım ortamındadır (Railway cron, `docs/deploy.md`).

## Sonuçlar

- Her kayıt `DRAFT`'tır; yayın admin onayıyla olur (onay kuyruğu Sprint 2'nin sonraki görevi).
- Uygulama hatası (ör. veritabanı bağlantısı) çalıştırmayı `RUNNING` bırakabilir; gözlemlenebilirlik
  (Sprint 5) bu kayıtları uyarıya bağlayacak.
