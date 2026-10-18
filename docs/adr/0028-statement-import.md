# 0028 — Ekstre PDF'inden harcama içe aktarma

- **Durum:** Kabul edildi (bankaya özel ayrıştırıcılar örnek bekliyor)
- **Tarih:** 2026-10-18

## Bağlam

Faz 2: harcamaları tek tek girmek yerine kredi kartı ekstresinden toplu ekleme. Kısıtlar:

- Ekstre kişisel veri taşır (ad, adres, maskeli kart numarası, işyerleri); PDF'ler çoğu zaman
  parolalıdır. "Kart numarası hiçbir formda alınmaz" kuralı korunmalı.
- Bankaya özel ayrıştırıcı ancak o bankanın gerçek ekstresi görülerek yazılabilir (banka
  adaptörlerindeki kuralın aynısı); elimizde örnek yok ve bu ortam banka sitelerine erişemiyor.

## Karar

- **Akış:** `/harcamalar/ekstre` → web `POST /api/me/statements/parse` (multipart; PDF ≤ 4 MB,
  isteğe bağlı parola; kullanıcı başına saatte 20) → motor `POST /statements/parse` (base64,
  `ENGINE_TOKEN`) → satırlar web'de önerilerle zenginleşir → kullanıcı onaylar →
  `POST /api/me/statements/import` → `Transaction (source = STATEMENT)`.
- **Saklanmayanlar:** PDF, çıkarılan metin, satır açıklamaları ve parola hiçbir yerde
  saklanmaz ve günlüğe yazılmaz (motor hata yanıtı yalnızca kod; web yalnızca durum kodunu
  günlüğe yazar). Kaydedilen yalnızca onaylanan satırların tarihi, tutarı, kategorisi ve
  tanındıysa markası. Açıklamalardaki kart numarası benzeri diziler motorda silinir.
- **Motor** (`engine/statements/`, durumsuz): `extract.py` (pypdf; boyut, sayfa ≤ 30, şifre:
  parolasız/yanlış parola kodları), `parsers/` kaydı (`@register`, `detect` ile seçim, yoksa
  genel), `parsers/generic.py`: "GG.AA.YYYY AÇIKLAMA 1.234,56" satırları; eksi işaretli, `+`/`A`
  son ekli, ödeme/iade/iptal/toplam/dönem borcu satırları atlanır ve sayılır; tarih içerip
  çözülemeyen satırlar `unparsedLines` olarak bildirilir (yeni biçim sinyali). Taksit ("TAKSİT 2/6")
  işaretlenir; tutar o taksitin tutarıdır.
- **Onay ekranı:** marka önerisi (`lib/statement-match.ts`: Türkçe harf sadeleştirme, kelime
  sınırı, en uzun eşleşme) ve markanın ana kategorisi; aynı kart + gün + tutarla kayıtlı harcama
  "zaten girilmiş olabilir" (seçili gelmez); 90 günden eski/ileri tarihli satır seçilemez;
  kategorisi olmayan seçili satır varsa ekleme kapalı.
- **Testler:** motor ve e2e testleri elle üretilen küçük **SENTETİK** PDF'lerle çalışır (gerçek
  banka biçimi değildir); şifreli PDF motor testinde pypdf ile üretilir.

## Sonuçlar

- Genel ayrıştırıcının hangi bankalarda çalıştığı bilinmiyor; her banka için anonimleştirilmiş
  bir örnek ekstreyle (ad, adres, kart numarası karartılmış) bankaya özel ayrıştırıcı ve
  fixture eklenmeli. `unparsedLines` > 0 olan yüklemeler yeni biçimin göstergesi.
- Taranmış (görüntü) PDF'ler desteklenmez (OCR yok).
- Ekstre parolası çoğu bankada kimlik bilgisinden türetilir; yalnızca istek süresince bellekte
  kalır.
- Aydınlatma metnine ekstre işleme eklendi (sürüm `2026-10-18.5`).
