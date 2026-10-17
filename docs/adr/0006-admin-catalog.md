# 0006 — Admin: rol kapısı, katalog yönetimi ve işlem kaydı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Katalog (banka, program, kart, kazanç oranı) admin tarafından yönetilir. Seed verisi doğrulanmamış
(ADR 0005); oranlar banka kaynağından tek tek doğrulanacak. Güvenlik listesi admin rotaları için
rol kontrolü ve "kim neyi onayladı" kaydı istiyor. Sprint 1'e kadar admin sayfaları yalnızca giriş
istiyordu.

## Karar

- **Rol kapısı:** `requireAdmin()` admin olmayana `notFound()` verir (bölümün varlığı belli olmaz);
  API'de `withAdmin()` 401/403 döner. Admin layout'u başlık ve menü dahil her şeyi rol
  doğrulandıktan sonra çizer; admin sayfaları başlık (`metadata.title`) taşımaz, çünkü statik
  iskelete girip bölümün varlığını gösterirdi. Rol her istekte veritabanından okunur (veritabanı
  oturumları), yetki değişikliği hemen geçerlidir.
- **İşlem kaydı:** `AdminAuditLog` (aktör, aktör e-postası, işlem, varlık, önce/sonra farkı). Her
  katalog değişikliği ile kaydı aynı transaction'da yazılır. Admin hesabı silinse de kayıt kalır.
- **Doğrulama kuralı:** `verified: true` → doğrulama tarihi yazılır (değer değişmediyse eski tarih
  korunur); `false` → temizlenir; gönderilmezse değer değiştiyse temizlenir. Böylece doğrulanmış bir
  oranı değiştirip yeniden doğrulamayı unutmak, onu sessizce "doğrulanmış" bırakmaz.
- **Kart oranları tek formda:** temel oran, kategori oranları (tamamı, listede olmayan silinir) ve
  doğrulama işareti `PATCH /api/admin/catalog/cards/{id}` ile birlikte kaydedilir. Oranlar
  arayüzde yüzde (`0,5`), sistemde bps; temel oran üst sınırı %20 (yazım hatası koruması).
- **Silme:** yalnızca boşsa — banka programsız, program kartsız, kart hiçbir kullanıcı tarafından
  seçilmemişse.
- **Formlar:** `<form action>` her işlemde formu sıfırladığı için admin formları işlemi elle çağırır;
  hata alınca girilen değerler korunur.

## Sonuçlar

- Sprint 2 kampanya onay kuyruğu aynı rol kapısını ve işlem kaydını kullanmalı.
- Kategori ve marka yönetimi kapsam dışı (seed'deki 6 kategori, 30 marka); gerekirse aynı kalıpla
  eklenir.
- Kullanıcıya admin rolü verme arayüzü yok: ilk admin `SEED_ADMIN_EMAIL` ile seed'den gelir.
