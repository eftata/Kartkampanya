# 0005 — Katalog şeması: temel oran kartta, kategori oranları ayrı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-14

## Bağlam

ROADMAP taslağında kartın kampanyasız kazancı tek tabloda (`EarnRate`) tutuluyordu;
`categoryId = null` "tüm harcamalar" anlamına geliyordu. PostgreSQL tekillik kuralında `NULL`
değerleri birbirinden farklı sayılır; bu yüzden bir karta birden fazla "tüm harcamalar" oranı
girilebilirdi ve optimizer hangisini kullanacağını bilemezdi. Prisma 7.10 şemasında kısmi indeks
veya `NULLS NOT DISTINCT` tanımlanamıyor.

## Karar

- Temel oran `CardProduct.baseRateBps` (varsayılan 0) alanında tek değer olarak durur.
- `EarnRate` yalnızca kategoriye özel oranları tutar: `categoryId` zorunlu, `(cardProductId,
categoryId)` tekil. Bir kategori için satır yoksa temel oran geçerlidir. Bu, `PlanRequest`
  içindeki `baseRateBps: { "*": 50, "akaryakit": 100 }` biçimine birebir eşlenir.
- Taslaktaki metin kimlikleri gerçek ilişkilere çevrildi: `EarnRate.category`,
  `SpendProfile.category`, `Category.parent/children` (silinirse alt kategoriler köke düşer).
- Seed'in tekrar çalıştırılabilmesi için doğal anahtarlar tekil: `Program.slug` (veri hattı
  adaptörleri de bununla eşleşir), `(bankId, name)`, `(programId, name)`.
- Silme davranışı: kullanıcı silinince `UserCard` ve `SpendProfile` silinir (KVKK); bir kullanıcının
  seçtiği kart ürünü silinemez (`Restrict`) — katalogdan kaldırma ileride "pasif" bayrağıyla yapılır.
- `pointValueTL` `Decimal(10,4)`: puan değeri kesirli olabilir (ör. 1 puan = 0,5 TL); para tutarı
  değildir, kuruş kuralı tutarlar için geçerli kalır.

## Sonuçlar

- `SpendProfile.merchantIds` taslaktaki gibi kimlik dizisidir (yabancı anahtar yok); uygulama
  katmanı geçerli `Merchant.id` olduklarını doğrular.
- `statementDay` (1–31) ve tutarların negatif olmaması uygulama katmanında zod ile doğrulanır.
- `Program.campaigns` ilişkisi Sprint 2'de `Campaign` modeliyle birlikte eklenecek.
