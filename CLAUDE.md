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
- **Araçlar:** pnpm workspace + Turborepo, ESLint (flat config) + Prettier, ruff
- **Yerel altyapı:** Docker Compose (Postgres, Redis, Mailpit)

## Komutlar

```bash
pnpm install              # bağımlılıklar
docker compose up -d      # postgres:5432, redis:6379, mailpit:1025 (UI :8025)
cp .env.example .env      # ilk kurulumda
pnpm dev                  # tüm uygulamalar (turbo)
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit
pnpm test                 # Vitest
pnpm format               # Prettier
pnpm --filter @kartplan/shared test   # tek paket

# Python motoru (services/engine kurulduktan sonra)
cd services/engine && uv sync && uv run pytest && uv run ruff check .
```

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
