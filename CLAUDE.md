# CLAUDE.md — KartPlan (Kart Kampanya Platformu)

Kullanıcının kredi kartlarını ve aylık harcama profilini alıp, bankaların kampanyalarına göre
"hangi harcamayı hangi kartla yapmalıyım" planı çıkaran web platformu.

**Her oturumun başında `docs/ROADMAP.md`'yi oku.** Sprint görevleri, kabul kriterleri, veritabanı
şeması taslağı, API sözleşmesi ve optimizasyon girdi/çıktı formatları oradadır. Kapsam değişirse
önce ROADMAP güncellenir.

## Stack

- **Web:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Auth.js — `apps/web`
- **DB:** PostgreSQL 16 + Prisma — `packages/db` (şemanın tek sahibi)
- **Sözleşme:** zod şemaları — `packages/shared`
- **Motor:** Python 3.12 + FastAPI + OR-Tools (CP-SAT), uv ile yönetilir — `services/engine`
- **Test:** Vitest, Playwright (e2e), pytest
- **Araçlar:** pnpm workspace + Turborepo, ESLint 9 (flat config) + Prettier, ruff
- **Yerel altyapı:** Docker Compose (Postgres, Redis, Mailpit)

## Komutlar

```bash
pnpm install              # bağımlılıklar
docker compose up -d      # postgres:5432, redis:6379, mailpit:1025 (UI :8025)
cp .env.example .env      # ilk kurulumda
pnpm db:deploy            # migration'ları uygula (ilk kurulumda)
pnpm db:seed              # seed (SEED_ADMIN_EMAIL → ADMIN kullanıcı)
pnpm dev                  # tüm uygulamalar (turbo)
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit
pnpm test                 # Vitest
pnpm test:e2e             # Playwright (Postgres + Mailpit açık olmalı; build + start yapar)
pnpm build                # production build (turbo)
pnpm format               # Prettier
pnpm db:migrate -- --name <ad>        # şema değişikliği → yeni migration
pnpm db:studio                        # Prisma Studio
pnpm --filter @kartplan/shared test   # tek paket
pnpm --filter @kartplan/web dev       # yalnızca web: http://localhost:3000

# Python motoru (services/engine kurulduktan sonra)
cd services/engine && uv sync && uv run pytest && uv run ruff check .
```

## Web (`apps/web`)

- **Next.js 16** (App Router, Turbopack, `cacheComponents` açık). Eğitim verinden farklı olabilir:
  kod yazmadan önce `apps/web/node_modules/next/dist/docs/` altındaki ilgili rehberi oku
  (ör. `middleware` yerine `proxy`, `LayoutProps`/`PageProps` global tipleri, `connection()`).
- Rota grupları: `(public)` → `/`, `/kampanyalar` (SEO) · `(app)` → `/plan`, `/kartlarim`,
  `/kampanyalarim`, `/profil` · `admin` → `/admin/kampanyalar` (onay kuyruğu), `/admin/katalog`.
  Gruplar URL'e eklenmez; farklı gruplarda aynı yol olamaz.
- Tailwind v4 (`@tailwindcss/turbopack` loader, `tailwind.config` yok; tema `app/globals.css`).
- shadcn/ui (new-york, neutral): bileşenler `components/ui/`. Ekleme:
  `pnpm dlx shadcn@latest add <bileşen>` (`apps/web` içinde). Ağ izni yoksa bileşen kaynağını
  shadcn dokümanından elle kopyala.
- Fontlar `geist` paketinden yerel yüklenir (build ağa bağımlı değil). `<html lang="tr">`.

## Kimlik (`apps/web`) — ayrıntı: docs/adr/0003-auth.md

- Auth.js v5 beta (`next-auth@5.0.0-beta.32`, sabit sürüm) + Prisma adaptörü, veritabanı oturumları.
- Yapılandırma `apps/web/auth.ts`; giriş sayfası `/giris`, doğrulama `/giris/dogrula`.
- Korumalı yollar `lib/auth/routes.ts` içinde (`proxy.ts` matcher'ı ile senkron tut).
- Kullanıcıya özel veri okuyan her yerde `requireUser()` (`lib/auth/session.ts`) çağır; bileşen
  `<Suspense>` içinde olmalı. Proxy yalnızca iyimser çerez kontrolüdür, yetkilendirme değildir.
- Magic link e-postaları yerelde Mailpit'e düşer: http://localhost:8025

## Veritabanı (`packages/db`)

- **Prisma 7.10** (RC değil). Bağlantı `prisma.config.ts`'de (kök `.env`), şemada `url` yok.
- İstemci `src/generated/prisma`'ya üretilir (git'te yok); turbo `generate` görevi otomatik çalıştırır.
  Elle: `pnpm --filter @kartplan/db generate`.
- Kullanım: `import { getPrisma } from "@kartplan/db"` — modül seviyesinde istemci oluşturma.
- Modeller ROADMAP'teki taslaktan sprint sprint eklenir; her şema değişikliği migration + seed ile gelir.
- DB testleri `DATABASE_URL` yoksa atlanır; yerelde Postgres açıkken çalışır.

## Mimari kurallar

- `apps/web`: iş mantığı `lib/` altında; route dosyaları (`app/**/route.ts`, `page.tsx`) ince kalır.
- Tüm API girdileri ve çıktıları `packages/shared` içindeki zod şemalarıyla doğrulanır.
- `/api/me/*` oturum ister; `/api/admin/*` ek olarak `role = ADMIN` ister.
- Python motoru dışarı açılmaz; yalnızca web sunucusu `ENGINE_TOKEN` ile çağırır.
- Optimizer **durumsuzdur**, veritabanına dokunmaz: `PlanRequest` → `PlanResponse`.
- Veri hattı sonuçları her zaman `status = DRAFT` yazar; yayına alma kararı admin onayıdır.
- Şema yalnızca Prisma migration ile değişir; Python tarafı şemayı değiştirmez.
- Prisma dışında ham SQL yok.

## Kod kuralları

- **Para birimi:** tutarlar her yerde **kuruş cinsinden tamsayı** (`Int`, alan adı `...Kurus`).
  Oranlar **baz puan** (`...Bps`, 50 = %0,5). Float ile para hesabı yapma.
- TypeScript `strict` + `noUncheckedIndexedAccess`; `any` kullanma, tip importlarında `import type`.
- Yeni ortam değişkeni → `.env.example` güncellenir. Gizli anahtar asla repoya girmez.
- Şema değişikliği → migration + seed birlikte güncellenir.
- Mimari karar → `docs/adr/NNNN-baslik.md` altına kısa not.
- Kullanıcıya görünen metinler Türkçe; kod, tanımlayıcılar ve commit mesajları İngilizce olabilir.

## Güvenlik / KVKK (pazarlık konusu değil)

- Kart numarası, CVV, son kullanma tarihi **hiçbir formda** alınmaz; 16 haneli sayılar reddedilir.
- Açık rıza versiyonlu olarak `Consent` tablosuna yazılır; pazarlama rızası ayrıdır.
- Analitik araçlarına kişisel veri (e-posta, isim) gönderilmez.
- Scraper'lar: istekler arası ≥ 2 sn, günde bir tarama, net User-Agent, `robots.txt`'e uyum.

## Tamamlandı tanımı (her görev)

1. Testler yazıldı ve `pnpm lint && pnpm typecheck && pnpm test` (ve Python için pytest + ruff) yeşil.
2. Tip hatası ve lint uyarısı yok.
3. `.env.example`, migration/seed ve gerekiyorsa ADR güncel.
4. `docs/ROADMAP.md`'deki ilgili kutu işaretlendi.
5. Oturum sonunda commit atıldı.
