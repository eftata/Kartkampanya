# 0013 — Ayıklama doğruluğunun ölçülmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Sprint 2 kabulü: elle etiketlenmiş 30 kampanyalık sette eşik ve ödül alanlarında ≥ %85 doğruluk.
Gerçek kampanya metni gerekir; geliştirme ortamının ağ politikası banka sitelerini engellediği için
set bu ortamda toplanamaz. Kampanya uydurmak ölçümü anlamsız kılar.

## Karar

- **Set biçimi:** `services/engine/eval/cases/<id>.json` (ham metin + beklenen kurallar,
  `labeled_by: admin | elle`, `synthetic`) ve `eval/catalog.json` (kategori slug'ları, marka adları).
  Etiketler veritabanı id'si değil slug/ad kullanır: set taşınabilir, okunur ve gözden geçirilebilir.
- **Etiket kaynağı:** onay kuyruğunda kaynakla karşılaştırılıp onaylanan kampanya, elle doğrulanmış
  etikettir; `export` bunları vaka olarak yazar (var olan dosyayı ezmez). LLM önerisine çapalanmayı
  ölçmek için vakaların bir kısmı LLM çıktısı görülmeden sıfırdan etiketlenir (`labeled_by: elle`);
  rapor iki kaynağın sayısını gösterir.
- **Çalıştırma:** `run` üretimdeki `extract`'ı aynen kullanır (istem, şema, yeniden deneme) ve
  tahminleri `predictions.jsonl`'e yazar; `score` API çağırmadan yeniden puanlar.
- **Puanlama:** kurallar sıradan bağımsız, en çok alanı tutan eşlemeyle eşlenir. Eksik ve fazladan
  kuralın her alanı hata; başarısız ayıklamada tüm alanlar hata. "Değer yok" (`None`) ile "kural
  yok"/"ayıklanamadı" ayrı işaretlerle karşılaştırılır, yanlışlıkla doğru sayılmaz. Kabul ölçütü:
  eşik türü/tutarı/adedi/tekrarı + ödül türü/tutarı/oranı + üst limit (hepsi birlikte, mikro
  ortalama). Kategori, marka, hariçler, katılım ayrıca raporlanır.
- **Rapor:** `eval/report.md` (alan tablosu, hatalı vakalarda beklenen/üretilen). Çıkış kodu
  0/1/2 (tuttu / tutmadı / set ya da tahmin yok) — ileride CI'da kullanılabilir.
- **Sentetik vakalar** yalnızca testlerdedir ve rapora girmez.

## Sonuçlar

- Ölçüm, gerçek kampanyalar onaylandıktan sonra yapılabilir: veri hattının izinli bir ortamda
  çalışması (adaptörler) ve 30 kampanyanın admin tarafından doğrulanması gerekir.
- `run` her vakada ücretli API çağrısıdır (geçersiz çıktıda ikinci çağrı); prompt/model değişmediyse
  `score` yeterlidir.
- Admin onayından gelen etiketler ayıklamanın kendi önerisinden türediği için doğruluğu iyimser
  gösterebilir; "elle" vakaların sonucu ayrıca karşılaştırılmalıdır.
