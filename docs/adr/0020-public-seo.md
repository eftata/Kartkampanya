# 0020 — Landing, herkese açık kampanya sayfaları ve sitemap

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Sprint 5: landing sayfası, arama motorlarından gelen ziyaretçi için herkese açık kampanya
sayfaları ve sitemap. Kısıtlar: kişisel veri gösterilmez; CI build'inde veritabanı yok; Next 16
`cacheComponents` açık (statik kabuk + istek anında akan içerik).

## Karar

- **Veri** `apps/web/lib/public-campaigns.ts`: liste ve sitemap yalnızca onaylı (`APPROVED`),
  bitmemiş ve katılım süresi geçmemiş kampanyalar (kişisel listeyle aynı koşul, ADR 0014). Detay
  süresi dolanları da açar (paylaşılmış bağlantı kırılmasın) ama `robots: noindex` verir; taslak ve
  reddedilen 404.
- **Adres** `/kampanyalar/<başlıktan-slug>-<id>` (`lib/campaign-slug.ts`): başlık adreste görünür,
  kampanyayı yalnızca id belirler (cuid tire içermez). Başlık değişirse ya da yalnızca id ile
  gelinirse kanonik adrese kalıcı yönlendirme; `<link rel="canonical">` her zaman kanonik adres.
  Slug tabloda tutulmaz (şema değişmez); başlıktan her seferinde türetilir.
- **Filtreler** URL'de: `?program=<program slug>&kategori=<ana kategori slug>`. Kategorisiz
  ("tüm harcamalar") kampanyalar her kategoride görünür. Filtreli sayfaların kanoniği `/kampanyalar`.
- **Metadata:** detayda `generateMetadata` (başlık, özet → açıklama, Open Graph `article`);
  sayfa ve metadata aynı sorguyu React `cache` ile paylaşır. Kök layout `metadataBase` =
  `APP_URL` (build anında; `turbo.json → build.env`).
- **Sitemap / robots** (`app/sitemap.ts`, `app/robots.ts`): `await connection()` ile istek anında
  üretilir; veritabanı build'de okunmaz, adres çalışma ortamının `APP_URL`'inden gelir. robots
  kişisel sayfaları, admin'i, API'yi, giriş/onay/abonelik akışlarını kapatır
  (`lib/site.ts → NON_INDEXED_PATHS`).
- **"Bugün"** (süresi doldu mu, bitmek üzere mi) istek anında: herkese açık sayfalar `turkeyToday()`
  öncesinde `connection()` çağırır (aksi halde Next prerender sırasında `new Date()` hatası verir).
- **Landing** statik kalır (veritabanı sorgusu yok): "Nasıl çalışır?", güvenceler (kart bilgisi
  yok, kontrol edilmiş kampanyalar, gereksiz harcamaya teşvik yok, KVKK), çağrı.

## Sonuçlar

- `cacheComponents` ile statik kabuk önce gönderildiği için detayda `notFound()` ve
  `permanentRedirect()` HTTP durum kodunu değiştiremez (200 kalır). Next bunun yerine
  `<meta name="robots" content="noindex">` ve 0 saniyelik `meta refresh` ekler; arama motorları
  bunları sırasıyla "yok" ve kalıcı yönlendirme olarak işler. Gerçek 404/308 gerekirse proxy'de
  veritabanına bakmak gerekir; şimdilik gerek görülmedi.
- Kampanya sayısı küçük olduğundan kategori filtresi bellekte uygulanır; binlerce kampanyada
  sorguya taşınmalı.
- Sayfalar her istekte veritabanına gider (önbellek yok). Trafik artarsa liste `"use cache"` +
  `cacheLife("hours")` ile önbelleğe alınabilir; "bugün" o zaman önbellek anahtarına girmeli.
