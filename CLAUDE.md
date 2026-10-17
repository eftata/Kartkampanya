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

# Python motoru (services/engine) — Python 3.12, uv
cd services/engine && uv sync         # ilk kurulum (uv python install 3.12 gerekebilir)
pnpm engine:dev                       # http://localhost:8000 (--reload)
pnpm engine:check                     # ruff check + ruff format --check + mypy --strict + pytest
```

## Web (`apps/web`)

- **Next.js 16** (App Router, Turbopack, `cacheComponents` açık). Eğitim verinden farklı olabilir:
  kod yazmadan önce `apps/web/node_modules/next/dist/docs/` altındaki ilgili rehberi oku
  (ör. `middleware` yerine `proxy`, `LayoutProps`/`PageProps` global tipleri, `connection()`).
- Rota grupları: `(public)` → `/`, `/kampanyalar` (SEO), `/giris` · `(app)` → `/plan`, `/baslangic` → `/baslangic/harcama` (onboarding: kartlar → harcama profili; `/plan` ikisi de tamamlanmadan açılmaz), `/kartlarim`,
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
- Prisma 7'de `migrate dev` istemciyi **üretmez**: migration'dan sonra testleri `pnpm test` (turbo,
  önce `generate` koşar) ile çalıştır ya da `pnpm --filter @kartplan/db generate`.
- Şema değiştiğinde ROADMAP'teki şema taslağını da güncelle (ROADMAP tek gerçek kaynak).
- `prisma migrate reset` veritabanını siler; yalnızca kullanıcı açıkça onaylarsa çalıştırılır.
- Katalog seed'i (`prisma/seed-data/catalog.ts`) doğrulanmamış veridir: oranlar 0,
  `ratesVerifiedAt`/`pointValueVerifiedAt` boş. Banka kaynağından doğrulanmadan oran uydurma.
  Seed yalnızca eksik kayıt ekler, mevcutları ezmez (ADR 0005).
- DB testleri `DATABASE_URL` yoksa atlanır; yerelde Postgres açıkken çalışır.

## Motor (`services/engine`) — ayrıntı: docs/adr/0004-engine.md

- FastAPI uygulaması `engine/api.py`. `/health` açık; diğer tüm uçlar `protected` router'ına
  eklenir ve `Authorization: Bearer <ENGINE_TOKEN>` ister. `ENGINE_TOKEN` boşsa korumalı uçlar 503
  döner (kapalı başarısızlık). OpenAPI/docs sayfaları kapalı.
- Ayarlar `engine/settings.py` (pydantic-settings; yerelde kök `.env`, üretimde ortam değişkenleri).
- Kod kuralları: ruff (güvenlik kuralları dahil), `mypy --strict`, testler `tests/` altında pytest.
  Para yine kuruş cinsinden `int`; float ile para hesabı yok.
- Docker: `docker build -t kartplan-engine services/engine` (çok aşamalı, root olmayan kullanıcı,
  `PORT` değişkenini dinler).
- LLM ayıklama `engine/pipeline/extract.py` (ADR 0010): Claude API (`ANTHROPIC_API_KEY`,
  `LLM_MODEL`), yapılandırılmış çıktı + pydantic doğrulaması, geçersizse bir kez yeniden deneme,
  `fallbacks: "default"`. Testler `LlmClient` sahtesiyle; testlerde gerçek API çağrısı yapılmaz.

## CI ve deploy — ayrıntı: docs/deploy.md

- `.github/workflows/ci.yml`: web (format, lint, typecheck, migration + test, build), e2e
  (Postgres + Mailpit servisleriyle Playwright), engine (ruff, mypy, pytest), engine Docker imajı
  (build + duman testi), gitleaks (tüm geçmiş). Action'lar commit SHA'sına sabitli; güncellerken
  SHA'yı ve yanındaki sürüm yorumunu birlikte değiştir. Yerelde: `actionlint`.
- Yerel `pnpm build` kök `.env`'yi okuduğu için veritabanına erişir; CI build'i erişemez. Sayfa
  build'de veri okuyorsa yalnızca CI'da kırılır. CI koşulunu denemek için `.env`'siz temiz bir
  klonda `pnpm build`.
- Turbo **strict env** modunda: build sırasında okunan her ortam değişkeni `turbo.json` →
  `tasks.build.env` listesine eklenmeli (yoksa build onu görmez). Şu an: `AUTH_GOOGLE_ID/SECRET`.
- Staging: web → Vercel (`apps/web`), Postgres + motor → Railway. Migration'lar Vercel build
  komutunda `pnpm db:deploy` ile uygulanır.

## Uygulama katmanı kalıpları (`apps/web/lib`)

- İş mantığı `lib/<alan>.ts` (ör. `user-cards.ts`, `spend-profile.ts`): `server-only`, kullanıcı
  kimliğini parametre alır, `MutationResult` (`lib/result.ts`: `ok` / `code` + Türkçe `error`) döner. Sahiplik kontrolü sorguda yapılır
  (`where: { id, userId }`).
- Arayüz → `lib/<alan>-actions.ts` (Server Actions, kendi içinde `requireUser()` çağırır).
  API → `app/api/**/route.ts` ince kalır: `withUser()` (401) + `parseJson(request, ZodŞema)` (400).
- Ortak istemci bileşenleri: `components/card-manager.tsx` (kart ekle/düzenle/kaldır; onboarding +
  Kartlarım) ve `components/spend-profile-form.tsx` (onboarding + Profilim).
- Girdi şemaları ve DTO'lar `packages/shared` içinde; para girişi `parseTlInput`, gösterimi
  `formatKurus`. Serbest metin alanlarında kart numarası `looksLikeCardNumber` ile reddedilir.
- DB testleri `apps/web` Vitest'inde de çalışır (kök `.env`; `server-only` testte etkisiz).
- e2e testleri seed edilmiş kataloğa dayanır (`pnpm db:seed`); giriş için `e2e/helpers.ts → signUp`.

## Admin — ayrıntı: docs/adr/0006-admin-catalog.md

- Rol: `requireAdmin()` (sayfa/action; admin değilse 404), `withAdmin()` (API; 401/403). **Her admin
  sayfası** içeriğini kendi `<Suspense>`'i içinde `await requireAdmin()` ile başlatır: layout'taki
  kapı sayfayı dinamik yapmaz, Next sayfayı build'de önceden render eder (DB sorgusu + statik
  çıktıya sızma). Admin layout'u da başlık dahil her şeyi rol doğrulandıktan sonra çizer; admin sayfaları `metadata` başlığı
  taşımaz (statik iskelette admin izi kalmasın). İlk admin: `SEED_ADMIN_EMAIL` + `pnpm db:seed`.
- Katalog değişiklikleri `lib/admin-catalog.ts` üzerinden, her biri transaction içinde
  `AdminAuditLog`'a yazılır (`actorEmail`, önce/sonra farkı). Yeni admin işlemi de kayıt yazmalı.
- Doğrulama kuralı: `verified: true` → tarih yazılır (değer değişmediyse eskisi korunur);
  `false` → temizlenir; gönderilmezse değer değiştiyse temizlenir.
- Oran girişi yüzde (`parsePercentInput("0,5")` → 50 bps), gösterimi `formatBps`.
- Admin formları `components/admin/action-form.tsx` (hata alınca girilen değerler korunur).
- e2e'de admin: `e2e/helpers.ts → makeAdmin(email)`. Next 16 önceki sayfaları gizli tutar
  (`<Activity>`); sayımlı assertion'larda `filter({ visible: true })` kullan.

## Kampanyalar — ayrıntı: docs/adr/0007-campaign-schema.md

- `CampaignSource` (adaptör başına kaynak, seed'de yok; adaptör ilk çalıştırmada oluşturur),
  `Campaign` (DRAFT → admin onayı → APPROVED), `CampaignRule`, `CampaignCard` (kart kapsamı; boş =
  programdaki tüm kartlar), `PipelineRun` (RUNNING → SUCCEEDED/FAILED).
- Kampanya kapsamındaki kart ürünü ve kampanyası/kaynağı olan program silinemez.
- Onay/ret işlemleri `AdminAuditLog`'a (`entityType = "Campaign"`) yazılır.
- Kişisel liste (ADR 0014): kurallar `lib/campaign-match.ts` (saf; kart kapsamı, ana kategoriye
  indirgeme, kaba tahmin), veri `lib/campaigns.ts → getMyCampaigns`. Yalnızca `APPROVED`, bitmemiş,
  katılım süresi geçmemiş; "bugün" `turkeyToday()` (UTC+3). Sayfa `/kampanyalarim`: filtreler URL'de
  (`lib/campaign-filters.ts`), kart `components/campaign-card.tsx`, etiket adları `lib/campaign-labels.ts`.
- Onay kuyruğu (ADR 0012): iş mantığı `lib/admin-campaigns.ts` (`reviewCampaign`: `save` durumu
  değiştirmez, `approve`, `reject`; kurallar ve kart kapsamı bütünüyle değişir). Form durumu metin
  (`lib/campaign-draft.ts` → `draftToInput`), şemalar `packages/shared/src/campaigns.ts`
  (kurallar veri hattının pydantic modeliyle aynı tutulmalı). İşlem kaydı yardımcıları
  `lib/admin-audit.ts`. e2e'de taslak kampanya: `e2e/helpers.ts → createDraftCampaign`.

## Veri hattı (`services/engine/engine/pipeline`) — ayrıntı: docs/adr/0008-pipeline-adapters.md

- Adaptör = `BankAdapter` alt sınıfı (`adapters/<ad>.py`, `@register`): yalnızca `parse_list` ve
  `parse_detail` yazar; ağ işi `PoliteFetcher` (robots.txt, aynı siteye ≥ 2 sn, `PIPELINE_USER_AGENT`).
  Robots okunamazsa site taranmaz.
- Metin/tarih: `html_to_text`, `normalize_text`, `find_dates`, `find_date_range` (`pipeline/text.py`).
- Her adaptör, sitenin **gerçek** sayfalarından kaydedilmiş fixture'larla test edilir
  (`tests/fixtures/<adaptör>-*.html`). Gerçek HTML görülmeden seçici yazılmaz; sentetik fixture'lar
  yalnızca taban sınıfı test eder ve dosya başında "SENTETİK" yazar.
- Değişiklik tespiti: `content_hash` (başlık + tarih + metin, boşluk farkları yok sayılır). Aynıysa
  yalnızca `lastSeenAt` güncellenir; değiştiyse kampanya `DRAFT`'a çekilir.
- `run_source(adapter, fetcher, store, llm)`: yeni/değişen kampanyaları ayıklar ve
  `save_extraction` ile kurallarla tek işlemde DRAFT yazar. Değişen kampanyanın yeni metni/özeti
  yalnızca ayıklama başarılıysa yazılır (başarısızsa ertesi gün yeniden denenir; ADR 0011).
  Testlerde LLM: `tests/ornek.py → ScriptedLlm`. Günlük iş: `python -m engine.pipeline [adaptör ...]`
  (taramadan sonra süresi dolanları `EXPIRED` yapar; `endsAt` son gün, Türkiye takvimi).
- Doğruluk ölçümü (ADR 0013, `services/engine/eval/README.md`): `pnpm engine:eval export|run|score`.
  Set `eval/cases/*.json` (slug/ad ile etiket, `labeled_by: admin|elle`). Vaka uydurulmaz;
  sentetik vakalar yalnızca testlerde (`synthetic: true`, rapora girmez). `run` ücretli API çağırır.
- DB erişimi yalnızca `pipeline/store.py` (`CampaignStore`, `connect`). `id` ve `updatedAt` Prisma'da
  uygulama tarafında üretilir; Python bunları açıkça yazar. Zaman damgaları UTC, saat dilimsiz.
- DB testleri `DATABASE_URL` yoksa atlanır; CI'da `ENGINE_DB_TESTS=required` atlanmayı yasaklar
  (motor işi Postgres + `pnpm db:deploy` ile çalışır).
- Bu geliştirme ortamının ağ politikası banka sitelerini engelliyor; fixture'lar izin verilen bir
  ortamdan kaydedilir.

## Mimari kurallar

- `apps/web`: iş mantığı `lib/` altında; route dosyaları (`app/**/route.ts`, `page.tsx`) ince kalır.
- Tüm API girdileri ve çıktıları `packages/shared` içindeki zod şemalarıyla doğrulanır.
- `/api/me/*` oturum ister; `/api/admin/*` ek olarak `role = ADMIN` ister.
- Python motoru dışarı açılmaz; yalnızca web sunucusu `ENGINE_TOKEN` ile çağırır.
- Optimizer **durumsuzdur**, veritabanına dokunmaz: `PlanRequest` → `PlanResponse`.
- Veri hattı sonuçları her zaman `status = DRAFT` yazar; yayına alma kararı admin onayıdır.
- Şema yalnızca Prisma migration ile değişir; Python tarafı şemayı değiştirmez.
- Prisma dışında ham SQL yok. **İstisna:** Python veri hattı Prisma kullanamaz; tüm SQL
  `services/engine/engine/pipeline/store.py` içinde, parametreli (psycopg), şemayı değiştirmeden (ADR 0009).

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
