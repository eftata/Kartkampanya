# 0002 — Prisma 7 ve sürücü adaptörü

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-14

## Bağlam

Prisma 7 ile bağlantı ayarı şemadan `prisma.config.ts`'ye taşındı ve istemci bir sürücü adaptörüyle
(`@prisma/adapter-pg`) oluşturuluyor. npm'deki `latest` etiketi şu an bir 8.0 RC sürümünü
gösteriyor.

## Karar

- Kararlı **Prisma 7.10.0** sabitlenir (RC kullanılmaz).
- İstemci `prisma-client` üreteciyle `packages/db/src/generated/prisma` altına üretilir; bu klasör
  repoya girmez, `turbo` `generate` görevi lint/typecheck/test/build/dev öncesi otomatik çalışır.
- Bağlantı adresi `prisma.config.ts`'de repo kökündeki `.env`'den okunur. `DATABASE_URL` yokken de
  `prisma generate` çalışır (CI ve build için).
- Uygulama kodu istemciyi `getPrisma()` ile tembel (lazy) alır: modül içe aktarılırken bağlantı
  kurulmaz, Next.js build'i veritabanı olmadan da geçer; geliştirme modunda tek örnek `globalThis`'te
  tutulur.

## Sonuçlar

- `@kartplan/db` paketini kullanan her yer `import { getPrisma } from "@kartplan/db"` yazar.
- Veritabanı testleri `DATABASE_URL` yoksa atlanır; CI'da (Sprint 0 / CI oturumu) Postgres servisiyle
  çalıştırılmalıdır.
