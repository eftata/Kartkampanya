# KartPlan — Kart Kampanya Platformu

Kartlarını ve aylık harcamanı gir; hangi harcamayı hangi kartla yaparak bankaların kampanyalarından
en çok kazanacağını gösteren aylık plan al.

- Yol haritası ve teknik plan: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Proje kuralları (Claude Code için): [`CLAUDE.md`](CLAUDE.md)
- Mimari kararlar: [`docs/adr/`](docs/adr)

## Gereksinimler

- Node.js 22+ (`.nvmrc`) ve pnpm 10 (`corepack enable`)
- Docker + Docker Compose
- Python 3.12 ve [uv](https://docs.astral.sh/uv/) (motor için, Sprint 0'da eklenecek)

## Yerel kurulum

```bash
# 1. Bağımlılıklar
corepack enable
pnpm install

# 2. Ortam değişkenleri
cp .env.example .env

# 3. Altyapı: PostgreSQL 16, Redis, Mailpit
docker compose up -d
docker compose ps         # hepsi "healthy" / "running" olmalı

# 4. Veritabanı şeması ve seed
pnpm db:deploy
pnpm db:seed              # .env'deki SEED_ADMIN_EMAIL için ADMIN kullanıcı

# 5. Geliştirme
pnpm dev                  # http://localhost:3000 — giriş e-postaları: http://localhost:8025
```

| Servis          | Adres                                             |
| --------------- | ------------------------------------------------- |
| PostgreSQL      | `localhost:5432` (kullanıcı/şifre/db: `kartplan`) |
| Redis           | `localhost:6379`                                  |
| Mailpit SMTP    | `localhost:1025`                                  |
| Mailpit arayüzü | <http://localhost:8025>                           |

## Komutlar

| Komut                            | Açıklama                                     |
| -------------------------------- | -------------------------------------------- |
| `pnpm dev`                       | Tüm uygulamaları geliştirme modunda başlatır |
| `pnpm lint`                      | ESLint                                       |
| `pnpm typecheck`                 | TypeScript tip kontrolü                      |
| `pnpm test`                      | Birim testleri (Vitest)                      |
| `pnpm format`                    | Prettier ile biçimlendirme                   |
| `pnpm db:migrate -- --name <ad>` | Şema değişikliğinden yeni migration          |
| `pnpm db:studio`                 | Prisma Studio                                |
| `docker compose down -v`         | Altyapıyı durdurur ve verileri siler         |

## Testler

```bash
pnpm test                 # birim testleri (DB testleri için Postgres açık olmalı)
pnpm test:e2e             # Playwright: Postgres + Mailpit açık, migration'lar uygulanmış olmalı
```

İlk kez Playwright çalıştırıyorsan tarayıcıyı kur: `pnpm --filter @kartplan/web exec playwright install chromium`.

## Repo yapısı

```
apps/web/          Next.js 16: arayüz + API + admin
packages/db/       Prisma 7 şeması, migration, seed
packages/shared/   zod sözleşmeleri (TS ↔ Python)
services/engine/   Python: CP-SAT optimizer + veri hattı (Sprint 0)
docs/              ROADMAP, ADR'ler
```
