# 0001 — Monorepo (pnpm + Turborepo)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-12

## Bağlam

Ürün üç parçadan oluşuyor: Next.js web uygulaması (arayüz + API + admin), Prisma ile yönetilen
PostgreSQL şeması ve Python motoru (CP-SAT optimizasyonu + kampanya veri hattı). Parçalar arasındaki
sözleşme (`CampaignRule`, `PlanRequest`, `PlanResponse`) sık değişecek ve tek geliştirici çalışıyor.

## Karar

- Tek repo; TypeScript paketleri **pnpm workspace** + **Turborepo** ile yönetilir
  (`apps/*`, `packages/*`).
- Python motoru `services/engine` altında **uv** ile ayrı yönetilir; pnpm workspace'inin parçası değildir.
- Veritabanı şemasının **tek sahibi Prisma**'dır (`packages/db`). Python tarafı şemayı değiştirmez,
  yalnızca okur/yazar.
- TS ↔ Python sözleşmesi `packages/shared` içindeki zod şemalarıdır; buradan JSON Schema üretilir ve
  Python pydantic modelleri bu şemaya karşı test edilir.
- Para tutarları her yerde kuruş cinsinden tamsayıdır; oranlar baz puandır (bps).

## Sonuçlar

- Sözleşme değişikliği tek PR'da web, şema ve motoru birlikte günceller.
- CI hem TS hem Python adımlarını çalıştırmak zorunda.
- TypeScript 7 (native) yayında olsa da `typescript-eslint` henüz desteklemediği için
  TypeScript `~6.0` kullanılır; destek gelince yükseltilir.
