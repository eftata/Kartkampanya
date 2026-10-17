# 0009 — Değişiklik tespiti ve Python'un veritabanı erişimi

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Veri hattı her gün aynı kampanya sayfalarını tarar. Metni değişmeyen kampanyayı yeniden LLM'e
göndermek maliyet ve gereksiz admin onayı demek. Metni değişen ve yayında olan kampanya ise eski
kurallarla kullanıcıya görünmeye devam etmemeli. Bu adım Python'un veritabanına ilk kez yazdığı
yer; projede "Prisma dışında ham SQL yok" kuralı var, ama Python Prisma kullanamaz.

## Karar

- **Özet (`Campaign.rawHash`):** başlık, başlangıç/bitiş tarihi ve şart metninin sha256'sı. Metinlerde
  boşluk, satır düzeni ve görünmez karakter farkları yok sayılır (sayfa şablonundaki önemsiz
  değişiklikler yeni onay doğurmasın). Kaynak adresi özete girmez.
- **Sınıflandırma:** veritabanında yok → yeni; özet aynı → değişmedi (yalnızca `lastSeenAt`); özet
  farklı → değişti: kampanya **hemen `DRAFT`'a çekilir** (onaylıysa yayından kalkar). Eski kurallar
  yeniden ayıklamaya kadar kalır ama `DRAFT` kullanıcıya görünmez. Tarih okunamazsa mevcut tarih
  korunur. _(Güncellendi, ADR 0011: yeni metin ve özet ayıklama başarılı olunca kurallarla birlikte
  yazılır.)_
- **`run_source`:** kaynağı bulur ya da oluşturur (kapalıysa atlar, çalıştırma kaydı açmaz),
  `PipelineRun` açar, listeyi ve detayları tarar; tek sayfanın hatası çalıştırmayı durdurmaz, kayda
  geçer; liste alınamazsa çalıştırma `FAILED`. Yeni ve değişen kampanyalar `pending` olarak döner;
  ayıklama ve kayıt ADR 0011'de aynı çalıştırmaya eklendi.
- **Python'un SQL'i tek modülde:** `engine/pipeline/store.py` (psycopg 3, parametreli sorgular,
  autocommit — her kampanya kendi işlemi). Şema değişmez; Prisma'nın uygulama tarafında ürettiği
  `id` (uuid4 hex) ve `updatedAt` açıkça yazılır; zaman damgaları UTC, saat dilimsiz. Prisma
  biçimindeki `?schema=` parametresi `search_path`'e çevrilir.
- **Testler:** veritabanı testleri gerçek Postgres'e karşı çalışır; CI'da `ENGINE_DB_TESTS=required`
  atlanmayı yasaklar, motor işi önce `pnpm db:deploy` ile migration'ları uygular.

## Sonuçlar

- Yeni kampanyanın veritabanına ilk yazımı ayıklamadan sonra olur (`joinMethod` gibi zorunlu alanlar
  ayıklamadan gelir).
- Onaylı bir kampanyanın metni değişince admin onay kuyruğunda yeniden görünür.
