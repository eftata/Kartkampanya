# Kart Kampanya Platformu — Geliştirici Yol Haritası

> 12 Ekim 2026 · @Eftal
>
> Bu doküman ürün dokümanındaki ürünü koda dökmek için sprint sprint ilerleyen teknik plandır.
> Repodaki **tek gerçek kaynak** budur; kapsam değişirse önce burası güncellenir.

## Varsayımlar ve çalışma şekli

MVP, 2 haftalık 7 sprintte (yaklaşık 14 hafta) kapalı betaya çıkar; Faz 2 ve Faz 3 sonrasında gelir.

- **Kapasite:** tek geliştirici, haftada ~15–20 saat (iş + yüksek lisans yanında). Daha fazla zaman olursa sprintler kısalır, kapsam değişmez.
- **Sprint:** 2 hafta; her sprint sonunda çalışan, canlıya alınmış bir dilim (staging ortamında tıklanabilir).
- **Claude Code ile çalışma:** her görev tek bir oturumda bitecek boyutta yazıldı. Oturum başında Claude'a ilgili görevi ve kabul kriterini ver; oturum sonunda testler geçmeli ve commit atılmalı.
- **Tek gerçek kaynak:** repo kökündeki `CLAUDE.md` (mimari kararlar, komutlar, kod kuralları) ve `docs/ROADMAP.md` (bu dokümanın Markdown ihracı). Claude Code her oturumda bunları okur.
- **Stack (kesinleşti):** Next.js (güncel kararlı sürüm, App Router) + TypeScript, PostgreSQL + Prisma, Python 3.12 + FastAPI + OR-Tools, Playwright, pnpm + Turborepo monorepo, Docker Compose ile yerel geliştirme.
- **Kapsam dışı (MVP):** mobil native uygulama, açık bankacılık, ödeme alma, ekstre içe aktarma.

## Sprint takvimi

19 Ekim 2026 Pazartesi başlanırsa MVP 24 Ocak 2027'de kapalı betayı tamamlar; Faz 2 Nisan 2027 ortasına kadar sürer.

| Sprint     | Konu             | Tarih                |
| ---------- | ---------------- | -------------------- |
| Sprint 0   | Kurulum          | 19 Eki – 1 Kas 2026  |
| Sprint 1   | Katalog          | 2 Kas – 15 Kas       |
| Sprint 2   | Veri hattı v1    | 16 Kas – 29 Kas      |
| Sprint 3   | Kampanya listesi | 30 Kas – 13 Ara      |
| Sprint 4   | Optimizasyon     | 14 Ara – 27 Ara      |
| Sprint 5   | Bildirim + KVKK  | 28 Ara – 10 Oca 2027 |
| Sprint 6   | Kapalı beta      | 11 Oca – 24 Oca      |
| **Kapı 1** | **Beta kararı**  | **24 Oca**           |
| Faz 2      | Takip            | 25 Oca – 18 Nis      |
| Faz 3      | Başlar           | 19 Nis               |

Tarihler öneridir: sınav dönemi veya yoğun iş haftalarında sprint uzatılır, sıra korunur. Sprint 2 ile 4 arası kritik yol: veri hattı gecikirse optimizasyon motoru elle girilmiş örnek kampanyalarla geliştirilmeye devam eder.

## Repo yapısı

Tek repo (monorepo): web uygulaması, Python motoru ve ortak paketler birlikte versiyonlanır; veritabanı şemasının tek sahibi Prisma'dır.

```
kartplan/
├─ CLAUDE.md                 # Claude Code için proje kuralları ve komutlar
├─ docker-compose.yml        # postgres, redis, mailpit (yerel e-posta)
├─ turbo.json · pnpm-workspace.yaml
├─ .github/workflows/ci.yml  # lint + typecheck + test (TS ve Python)
├─ docs/
│  ├─ ROADMAP.md
│  └─ adr/                   # mimari karar kayıtları (0001-monorepo.md ...)
├─ apps/
│  └─ web/                   # Next.js: arayüz + API route'ları + admin
│     ├─ app/(public)/       # landing (/), kampanya SEO sayfaları (/kampanyalar)
│     ├─ app/(app)/          # giriş sonrası: /plan, /kartlarim, /kampanyalarim, /profil
│     ├─ app/admin/          # kampanya onay kuyruğu, katalog yönetimi
│     ├─ app/api/            # REST endpoint'leri
│     ├─ lib/                # auth, db client, engine client, e-posta
│     └─ components/
├─ packages/
│  ├─ db/                    # Prisma şeması, migration'lar, seed (banka/program/kart)
│  └─ shared/                # zod şemaları: CampaignRule, PlanRequest, PlanResponse
└─ services/
   └─ engine/                # Python (uv ile yönetilir)
      ├─ engine/api.py       # FastAPI: POST /optimize, /health
      ├─ engine/optimizer/   # CP-SAT modeli
      ├─ engine/pipeline/
      │  ├─ adapters/        # banka başına scraper (bonus.py, maximum.py ...)
      │  ├─ extract.py       # LLM ile metin → CampaignRule JSON
      │  └─ run.py           # günlük iş: tara → ayıkla → taslak olarak kaydet
      └─ tests/
```

| Parça                       | Sorumluluk                                  | Dikkat                                                                      |
| --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                  | Tüm kullanıcı ve admin arayüzü, kimlik, API | İş mantığı `lib/` altında; route dosyaları ince kalır                       |
| `packages/db`               | Şema, migration, seed                       | Python tarafı şemayı değiştirmez, yalnızca okur/yazar                       |
| `packages/shared`           | TS ↔ Python arasındaki sözleşme             | zod'dan JSON Schema üretilir, Python pydantic modelleri bununla test edilir |
| `services/engine` optimizer | Durumsuz: gelen veriden plan üretir         | Veritabanına dokunmaz; test etmesi kolay                                    |
| `services/engine` pipeline  | Kampanya toplama ve ayıklama                | Sonuçları `status = DRAFT` yazar; yayın kararı vermez                       |

## Sprint detayları

Her sprint bir kabul kriteriyle biter; kriter sağlanmadan sonraki sprinte geçilmez. Görevleri bitirdikçe işaretleyebilirsin.

### Sprint 0 — Temel kurulum

- [x] Monorepo iskeleti (pnpm, Turborepo, ESLint, Prettier, TS strict)
- [x] `docker-compose.yml`: PostgreSQL 16, Redis, Mailpit
- [x] `apps/web`: Next.js + Tailwind + shadcn/ui, temel layout ve tema
- [x] `packages/db`: Prisma kurulumu, ilk migration (`User`, `Consent`)
- [x] Kimlik: Auth.js ile e-posta (magic link) + Google girişi
- [x] `services/engine`: uv projesi, FastAPI `/health`, pytest, ruff
- [x] CI: lint + typecheck + test (TS ve Python), PR'da zorunlu (zorunluluk: `main` ruleset → docs/deploy.md §0)
- [ ] Staging deploy: web → Vercel, engine + DB → Railway veya Fly.io
- [x] `CLAUDE.md` ve `docs/adr/0001-monorepo.md`

**Kabul:** staging adresinde kayıt olup giriş yapılabiliyor; CI yeşil; `docker compose up` + `pnpm dev` ile yerelde her şey ayakta.

### Sprint 1 — Katalog ve onboarding

- [x] Şema: `Bank`, `Program`, `CardProduct`, `EarnRate`, `Category`, `Merchant`, `UserCard`, `SpendProfile`
- [x] Seed: 5 program (Bonus, Maximum, World, Axess, Paraf/CardFinans), her birinden 3–5 popüler kart, 6 ana kategori + 30 popüler marka — kart adları, puan değerleri ve oranlar **doğrulanmadı** (`ratesVerifiedAt`/`pointValueVerifiedAt` boş, oranlar 0); admin panelinde kaynakla doğrulanacak
- [ ] Onboarding sihirbazı: banka → program → kart seçimi (kart numarası yok), opsiyonel limit ve kesim günü
- [ ] Harcama profili ekranı: kategori seçimi + aylık tutar kaydırıcısı + tercih edilen markalar
- [ ] "Kartlarım" ve "Profilim" düzenleme sayfaları
- [ ] Admin: katalog CRUD (banka/program/kart/kazanç oranı), rol tabanlı erişim

**Kabul:** yeni kullanıcı 3 dakikadan kısa sürede kartlarını ve harcama profilini girebiliyor.

### Sprint 2 — Kampanya veri hattı v1

- [ ] Şema: `Campaign`, `CampaignRule`, `CampaignSource`, `PipelineRun`
- [ ] Adaptör arayüzü + ilk 2 adaptör (örn. World ve Bonus): liste sayfası → detay sayfası → ham metin
- [ ] Değişiklik tespiti: metin hash'i aynıysa yeniden ayıklama yapma
- [ ] LLM ayıklama: ham metin → `CampaignRule[]` JSON + güven skoru (şema doğrulamalı)
- [ ] 30 elle etiketlenmiş kampanyalık test seti; ayıklama doğruluğu raporu
- [ ] Admin onay kuyruğu: ham metin ile ayıklanan kurallar yan yana, düzenle → onayla / reddet

**Kabul:** 2 programdan günlük iş çalışıyor; test setinde eşik ve ödül alanları ≥ %85 doğru; onaylanan kampanya yayına giriyor.

### Sprint 3 — Kişisel kampanya listesi

- [ ] Kalan 3 adaptör; süresi dolan kampanyaları otomatik kapatma
- [ ] Eşleştirme servisi: kullanıcının kartları × seçtiği kategoriler × aktif kampanyalar
- [ ] Kampanyalar sayfası: filtre (kart, kategori, fayda tipi), sıralama (bitiş tarihi, tahmini kazanç)
- [ ] Etiketler: "katılım gerekli", "bitmek üzere", "plana dahil"
- [ ] "Katıldım" işaretleme (`UserCampaignStatus`) ve bankanın kampanya sayfasına link
- [ ] Kampanya detay: 3 maddelik sade özet + kaynak bağlantısı

**Kabul:** kullanıcı yalnızca kendi kartlarına ve alanlarına uyan kampanyaları görüyor; 5 programdan veri akıyor.

### Sprint 4 — Optimizasyon motoru

- [ ] `packages/shared`: `PlanRequest` / `PlanResponse` zod şemaları → JSON Schema → pydantic
- [ ] CP-SAT modeli: bütçe dağılımı, kart limiti, kademeli eşik, üst limit, katılım durumu
- [ ] TL tamsayı ölçeğinde çözüm (CP-SAT tamsayı ister), 2 sn zaman aşımı + açgözlü yedek algoritma
- [ ] Birim testleri: ürün dokümanındaki örnek (beklenen 665 TL) dahil 10 senaryo
- [ ] "Bu ayın planı" sayfası: kategori başına kart + tutar + kampanya, toplam beklenen kazanç, "her şeyi tek kartla ödeseydin" kıyası
- [ ] Plan `MonthlyPlan` olarak saklanır; profil veya kampanya değişince yeniden hesaplanır

**Kabul:** 10 test senaryosu geçiyor; gerçek kullanıcı verisiyle plan 1 saniyenin altında geliyor.

### Sprint 5 — Bildirim, KVKK, vitrin

- [ ] E-posta: katılım hatırlatma (kampanya başlangıcında), son 3 gün uyarısı, haftalık plan özeti
- [ ] Bildirim tercihleri ve tek tıkla abonelikten çıkma
- [ ] KVKK: aydınlatma metni, açık rıza kaydı (versiyonlu), veri indirme, hesap silme
- [ ] Landing page + herkese açık kampanya sayfaları (SEO), sitemap
- [ ] Rate limiting, güvenlik başlıkları, hata takibi (Sentry), ürün analitiği (PostHog)

**Kabul:** güvenlik ve KVKK kontrol listesi (aşağıda) tamamen işaretli.

### Sprint 6 — Kapalı beta

- [ ] Production ortamı, yedekleme, izleme panosu
- [ ] 20–50 davetli kullanıcı (Genç Finans Kulüp, çevre) ve geri bildirim formu
- [ ] Huni ölçümü: kayıt → kart girdi → planı gördü → 2. hafta geri döndü
- [ ] Hata düzeltme ve kampanya veri doğruluğu iyileştirmeleri

**Kabul (Kapı 1):** kullanıcılar planı görüyor ve geri dönüyor mu? Evet ise Faz 2'ye geçilir.

### Faz 2 — Takip (Sprint 7–12)

- [ ] Manuel harcama girişi + eşik ilerleme çubuğu + kalan bütçeyle yeniden planlama
- [ ] Ekstre PDF yükleme → işlem çıkarma (banka başına ayrıştırıcı)
- [ ] Ay sonu raporu: kazanılan / kaçırılan
- [ ] Tek alışveriş hesaplayıcı ("4.000 TL telefon, hangi kart?")
- [ ] PWA + web push
- [ ] Kullanıcı hata bildirimi ("bu kampanya yanlış")

### Faz 3 — Otomasyon (Sprint 13+)

- [ ] Açık bankacılık: lisanslı ortak ile kart hareketi entegrasyonu
- [ ] Cüzdan analizi: "bu kartı alırsan ayda +X TL" + kart başvuru komisyonu
- [ ] Tarayıcı eklentisi (ödeme anında kart önerisi)
- [ ] Premium abonelik

## Veritabanı şeması

Taslağın çekirdeği: kampanya, `CampaignRule` satırlarına bölünmüş kural seti olarak durur; para tutarları kuruş cinsinden tamsayı (`Int`) saklanır. Sprint 0–4 boyunca parça parça eklenir.

```prisma
// packages/db/prisma/schema.prisma (taslak)

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
  cards        UserCard[]
  spend        SpendProfile[]
  consents     Consent[]
  plans        MonthlyPlan[]
  campaignStat UserCampaignStatus[]
  notifyPrefs  Json     @default("{}")
}
enum Role { USER ADMIN }

model Consent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  kind      String   // "kvkk_aydinlatma" | "pazarlama" ...
  version   String
  granted   Boolean
  createdAt DateTime @default(now())
}

model Bank {
  id       String    @id @default(cuid())
  name     String    @unique
  programs Program[]
}

model Program {
  id                   String        @id @default(cuid())
  bankId               String
  bank                 Bank          @relation(fields: [bankId], references: [id])
  slug                 String        @unique // "bonus", "world" — veri hattı adaptörleri bununla eşleşir
  name                 String // Bonus, Maximum, World ...
  pointName            String // Bonus, MaxiPuan, Worldpuan
  pointValueTL         Decimal       @default(1) @db.Decimal(10, 4) // 1 puan = ? TL
  // null = puan değeri doğrulanmadı (seed tahmini); admin kaynaktan doğrulayınca tarih yazılır.
  pointValueVerifiedAt DateTime?
  cards                CardProduct[]

  @@unique([bankId, name])
}

model CardProduct {
  id              String     @id @default(cuid())
  programId       String
  program         Program    @relation(fields: [programId], references: [id])
  name            String // Bonus Platinum
  type            CardType
  annualFee       Int? // kuruş
  baseRateBps     Int        @default(0) // kampanyasız, tüm harcamalara uygulanan temel oran
  earnRates       EarnRate[] // kategoriye özel oranlar (temel oranın yerine geçer)
  // null = baseRateBps ve earnRates doğrulanmadı (seed tahmini); admin doğrulayınca tarih yazılır.
  ratesVerifiedAt DateTime?
  userCards       UserCard[]

  @@unique([programId, name])
}

enum CardType {
  CREDIT
  DEBIT
  VIRTUAL
}

// Kartın bir kategorideki kampanyasız sabit kazanç oranı (ör. akaryakıtta %1).
// Kategori için satır yoksa CardProduct.baseRateBps geçerlidir. Kart başına kategori tekildir.
model EarnRate {
  id            String      @id @default(cuid())
  cardProductId String
  cardProduct   CardProduct @relation(fields: [cardProductId], references: [id], onDelete: Cascade)
  categoryId    String
  category      Category    @relation(fields: [categoryId], references: [id])
  rateBps       Int // baz puan: 50 = %0,5

  @@unique([cardProductId, categoryId])
}

model Category {
  id        String         @id @default(cuid())
  slug      String         @unique // market, akaryakit, e-ticaret
  name      String
  parentId  String?
  parent    Category?      @relation("CategoryTree", fields: [parentId], references: [id])
  children  Category[]     @relation("CategoryTree")
  merchants Merchant[]
  earnRates EarnRate[]
  spend     SpendProfile[]
}

model Merchant {
  id         String   @id @default(cuid())
  name       String   @unique // Migros, Opet, Trendyol
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])

  @@index([categoryId])
}


model UserCard {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  cardProductId String
  cardProduct   CardProduct @relation(fields: [cardProductId], references: [id], onDelete: Restrict)
  nickname      String?
  limitKurus    Int?
  statementDay  Int? // hesap kesim günü 1-31 (uygulama katmanında doğrulanır)
  createdAt     DateTime    @default(now())

  @@index([userId])
}

model SpendProfile {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id])
  monthlyKurus Int
  merchantIds  String[] // tercih edilen markalar (Merchant.id)

  @@unique([userId, categoryId])
}

model Campaign {
  id           String         @id @default(cuid())
  programId    String
  program      Program        @relation(fields: [programId], references: [id])
  cardScope    String[]       // boş = programdaki tüm kartlar
  title        String
  sourceUrl    String         @unique
  rawText      String
  rawHash      String
  summary      String[]
  startsAt     DateTime
  endsAt       DateTime
  joinMethod   JoinMethod
  joinDeadline DateTime?
  status       CampaignStatus @default(DRAFT)
  confidence   Float?
  rules        CampaignRule[]
  userStatus   UserCampaignStatus[]
  updatedAt    DateTime       @updatedAt
  @@index([status, endsAt])
}
enum JoinMethod { AUTO SMS APP WEB }
enum CampaignStatus { DRAFT APPROVED REJECTED EXPIRED }

model CampaignRule {
  id             String    @id @default(cuid())
  campaignId     String
  campaign       Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  categoryIds    String[]
  merchantIds    String[]
  thresholdType  Threshold // SINGLE (tek sefer) | CUMULATIVE | TXN_COUNT
  thresholdKurus Int?
  txnCount       Int?
  tierRepeat     Boolean   @default(false) // "her 2.500 TL'ye"
  rewardType     Reward    // POINTS | CASHBACK | DISCOUNT | INSTALLMENT
  rewardKurus    Int?      // sabit ödül
  rewardBps      Int?      // oransal ödül
  capKurus       Int?      // üst limit
  exclusions     String[]  // "taksitli", "nakit_avans" ...
}
enum Threshold { SINGLE CUMULATIVE TXN_COUNT }
enum Reward { POINTS CASHBACK DISCOUNT INSTALLMENT }

model UserCampaignStatus {
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  campaignId    String
  campaign      Campaign @relation(fields: [campaignId], references: [id])
  joined        Boolean  @default(false)
  inPlan        Boolean  @default(false)
  progressKurus Int      @default(0)
  @@id([userId, campaignId])
}

model MonthlyPlan {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  month         String   // "2026-11"
  input         Json
  result        Json
  expectedKurus Int
  realizedKurus Int?
  createdAt     DateTime @default(now())
  @@index([userId, month])
}

model PipelineRun {
  id         String    @id @default(cuid())
  adapter    String
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  found      Int       @default(0)
  changed    Int       @default(0)
  errors     Json?
}
```

Faz 2'de `Transaction` (kullanıcı, kart, tutar, tarih, kategori, kaynak) eklenir; MVP'de yok.

## API sözleşmesi

Tüm endpoint'ler `apps/web/app/api` altındadır, istek/yanıt gövdeleri `packages/shared` içindeki zod şemalarıyla doğrulanır. Python motoru dışarıya açılmaz; yalnızca web sunucusu çağırır.

| Yöntem              | Yol                                             | Ne yapar                                  | Sprint |
| ------------------- | ----------------------------------------------- | ----------------------------------------- | ------ |
| GET                 | `/api/catalog/banks`                            | Banka → program → kart ağacı (onboarding) | 1      |
| GET                 | `/api/catalog/categories`                       | Kategori ve marka listesi                 | 1      |
| GET / POST / DELETE | `/api/me/cards`                                 | Kullanıcının kartları                     | 1      |
| GET / PUT           | `/api/me/spend-profile`                         | Kategori başına aylık tutar ve markalar   | 1      |
| GET                 | `/api/me/campaigns?card=&category=&type=&sort=` | Kişiye eşleşen aktif kampanyalar          | 3      |
| PATCH               | `/api/me/campaigns/{id}`                        | `joined` / `inPlan` işaretleme            | 3      |
| GET                 | `/api/me/plan?month=2026-11`                    | Kayıtlı plan (yoksa hesaplar)             | 4      |
| POST                | `/api/me/plan/recompute`                        | Planı yeniden hesapla                     | 4      |
| GET / PUT           | `/api/me/notifications`                         | Bildirim tercihleri                       | 5      |
| GET                 | `/api/me/export`                                | KVKK veri indirme (JSON)                  | 5      |
| DELETE              | `/api/me`                                       | Hesap silme (30 gün içinde kalıcı)        | 5      |
| GET                 | `/api/admin/review-queue`                       | Onay bekleyen kampanyalar                 | 2      |
| PUT                 | `/api/admin/campaigns/{id}`                     | Kural düzenle, onayla / reddet            | 2      |
| CRUD                | `/api/admin/catalog/*`                          | Banka, program, kart, kazanç oranı        | 1      |
| POST                | `engine:/optimize` (iç ağ)                      | `PlanRequest` → `PlanResponse`            | 4      |
| POST                | `engine:/pipeline/run` (iç ağ, cron)            | Adaptörleri çalıştırır                    | 2      |

Kimlik doğrulama: `/api/me/*` oturum ister, `/api/admin/*` ek olarak `role = ADMIN` ister; motor ile web arası paylaşılan gizli anahtar (`ENGINE_TOKEN`) ile korunur.

## Optimizasyon servisi

Motor durumsuzdur: web, kullanıcının kartlarını, bütçesini ve uygun kampanya kurallarını tek bir `PlanRequest` olarak gönderir; motor `PlanResponse` döner. Tüm tutarlar kuruş cinsinden tamsayıdır.

### Girdi (`PlanRequest`)

```json
{
  "month": "2026-11",
  "budget": [
    { "category": "market", "amount": 600000 },
    { "category": "akaryakit", "amount": 300000 },
    { "category": "e-ticaret", "amount": 400000 }
  ],
  "cards": [
    { "id": "A", "limit": null, "baseRateBps": { "*": 50 } },
    { "id": "B", "limit": 1000000, "baseRateBps": { "*": 50 } },
    { "id": "C", "limit": null, "baseRateBps": { "*": 50 } }
  ],
  "campaigns": [
    {
      "id": "K1",
      "cards": ["A"],
      "categories": ["market"],
      "thresholdType": "CUMULATIVE",
      "threshold": 250000,
      "tierRepeat": true,
      "reward": 10000,
      "cap": 30000,
      "eligible": true
    },
    {
      "id": "K4",
      "cards": ["B"],
      "categories": ["market"],
      "thresholdType": "CUMULATIVE",
      "threshold": 500000,
      "tierRepeat": false,
      "reward": 25000,
      "cap": 25000,
      "eligible": true
    }
  ],
  "options": { "maxCards": 3, "timeLimitMs": 2000 }
}
```

`eligible: false` → katılım süresi geçmiş ve kullanıcı katılmamış; motor bu kampanyayı yok sayar.

### Çıktı (`PlanResponse`)

```json
{
  "status": "OPTIMAL",
  "allocations": [
    {
      "category": "market",
      "card": "B",
      "amount": 600000,
      "campaigns": ["K4"],
      "expectedReward": 28000
    }
  ],
  "campaignsHit": [{ "id": "K4", "tiers": 1, "reward": 25000 }],
  "nearMisses": [{ "id": "K1", "missingAmount": 250000, "extraReward": 10000 }],
  "totalExpected": 66500,
  "baseline": { "strategy": "single_best_card", "total": 26500 },
  "solver": { "engine": "cp-sat", "ms": 14 }
}
```

`nearMisses`, "biraz daha harcarsan şu kampanyayı da alırsın" önerisinin verisidir; arayüzde "gereksiz harcamaya teşvik etmeyiz" notuyla gösterilir.

### Test senaryoları (Sprint 4 kabulü)

| #   | Senaryo                                           | Beklenen                                                                 |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Ürün dokümanındaki 3 kart / 4 kampanya örneği     | Toplam 665 TL; market B'de, akaryakıt B'de, e-ticaret C'de               |
| 2   | Hiç kampanya yok                                  | En yüksek sabit orana sahip kart, kategori başına                        |
| 3   | Eşik bütçeden büyük                               | Kampanya planda yok, `nearMisses` içinde                                 |
| 4   | Kademeli kampanya, üst limit dolu                 | Limitten sonra harcama başka karta kayar                                 |
| 5   | Kart limiti bütçeden küçük                        | Limit aşılmaz, kalan diğer karta                                         |
| 6   | Aynı harcama iki kampanyaya uygun (aynı kart)     | Her iki ödül de sayılır (çakışma kuralı kampanyada aksi belirtilmedikçe) |
| 7   | İki farklı kartta eşik, bütçe yalnız birine yeter | Bütçe bölünmez, ödülü büyük olan seçilir                                 |
| 8   | `maxCards = 1`                                    | Tüm bütçe tek kartta, o kart için en iyi sonuç                           |
| 9   | Katılım süresi geçmiş kampanya                    | Yok sayılır                                                              |
| 10  | 8 kart, 15 kategori, 120 kampanya                 | 2 sn içinde çözüm (performans testi)                                     |

Senaryo 6'daki çakışma varsayımı kampanya şartlarına göre değişebilir; `CampaignRule` içine ileride `stackable` alanı eklenebilir.

## Kampanya veri hattı

Her banka için küçük bir adaptör yazılır; ortak hat değişiklik tespiti, LLM ayıklama ve kayıt işini yapar. Hiçbir kampanya insan onayı olmadan kullanıcıya görünmez (güven skoru yükseldikçe bu kural Faz 2'de gevşetilebilir).

### Akış

1. **Liste:** adaptör bankanın kampanya listesinden detay URL'lerini toplar.
2. **Detay:** her URL için başlık, tarih aralığı ve tam şart metni alınır.
3. **Değişiklik tespiti:** `rawHash` aynıysa atlanır; değiştiyse kampanya tekrar `DRAFT` olur.
4. **Ayıklama:** LLM, metni `CampaignRule[]` JSON'una çevirir; çıktı pydantic ile doğrulanır, geçersizse bir kez yeniden denenir.
5. **Kayıt:** `Campaign` + `CampaignRule` satırları `DRAFT` olarak yazılır, `PipelineRun` güncellenir.
6. **Onay:** admin panelinde ham metin ile kurallar yan yana; düzenle → `APPROVED`.
7. **Kapanış:** `endsAt` geçen kampanyalar gece işiyle `EXPIRED` olur.

### Adaptör arayüzü

```python
# services/engine/engine/pipeline/adapters/base.py
from dataclasses import dataclass
from datetime import date

@dataclass
class RawCampaign:
    source_url: str
    title: str
    raw_text: str
    starts_at: date | None
    ends_at: date | None

class BankAdapter:
    program: str          # "world", "bonus" ...
    list_url: str

    async def list_urls(self, page) -> list[str]: ...
    async def fetch(self, page, url: str) -> RawCampaign: ...
```

Kurallar: istekler arası bekleme (≥ 2 sn), günde bir tarama, net bir User-Agent, `robots.txt`'e uyum. Her adaptör için kayıtlı HTML örnekleriyle (fixture) test yazılır; site değişince test kırılır ve fark edilir.

### LLM ayıklama çıktısı

```json
{
  "join_method": "APP",
  "join_deadline": "2026-11-30",
  "summary": [
    "Markette toplam 2.500 TL harcamaya 100 TL puan",
    "En fazla 300 TL",
    "Taksitli işlemler hariç"
  ],
  "rules": [
    {
      "categories": ["market"],
      "merchants": [],
      "threshold_type": "CUMULATIVE",
      "threshold_kurus": 250000,
      "tier_repeat": true,
      "reward_type": "POINTS",
      "reward_kurus": 10000,
      "cap_kurus": 30000,
      "exclusions": ["taksitli"]
    }
  ],
  "confidence": 0.86,
  "uncertain_fields": []
}
```

Kategori ve marka adları serbest metin değil, istemde verilen katalog listesinden seçilir; listede olmayan marka `uncertain_fields` içine düşer ve admin tarafından kataloga eklenir.

## Kalite, güvenlik ve KVKK

Bir görev ancak aşağıdaki "tamamlandı" tanımını karşılıyorsa kapanır; Sprint 5 sonunda güvenlik ve KVKK listesinin tamamı işaretli olmalı.

### Tamamlandı tanımı (her görev)

- Testler yazıldı ve CI yeşil (TS: Vitest + Playwright e2e kritik akışlar; Python: pytest)
- Tip hatası ve lint uyarısı yok
- Yeni ortam değişkeni varsa `.env.example` güncel
- Şema değişikliği varsa migration + seed güncel
- Staging'de elle denendi
- Mimari bir karar alındıysa `docs/adr/` altına kısa not

### Güvenlik

- [ ] Kart numarası, CVV, son kullanma tarihi hiçbir formda yok (input doğrulaması 16 haneli sayıları reddeder)
- [ ] Gizli anahtarlar yalnızca ortam değişkenlerinde; repoda gizli tarama (gitleaks) CI adımı
- [ ] Tüm API girdileri zod ile doğrulanıyor; Prisma dışında ham SQL yok
- [ ] Rate limiting (giriş, magic link, plan hesaplama)
- [ ] Admin rotaları rol kontrolü + işlem kaydı (kim neyi onayladı)
- [ ] Güvenlik başlıkları (CSP, HSTS), HTTPS zorunlu
- [ ] Bağımlılık taraması (Dependabot / Renovate)
- [ ] Günlük veritabanı yedeği + geri yükleme bir kez denendi

### KVKK

- [ ] Aydınlatma metni ve gizlilik politikası yayında (avukat kontrolünden geçmiş)
- [ ] Açık rıza versiyonlu kaydediliyor (`Consent`), pazarlama rızası ayrı
- [ ] Veri indirme (`/api/me/export`) ve hesap silme çalışıyor
- [ ] Veri saklama süresi tanımlı; silinen hesaplar 30 gün sonra kalıcı silinir
- [ ] Analitik araçları kişisel veri almadan (e-posta, isim) çalışıyor
- [ ] Veri lokasyonu ve yurt dışı aktarım durumu yazılı olarak belirlendi
- [ ] VERBİS kayıt yükümlülüğü kontrol edildi
- [ ] Pazarlama e-postaları için İYS kaydı; işlemsel bildirimler ayrı şablon

## Claude Code ile başlangıç

İlk hafta için sıralı oturumlar: her istemi ayrı bir oturumda ver, oturum sonunda testleri çalıştır ve commit at. Bu dokümanı Markdown olarak indirip repoya `docs/ROADMAP.md` olarak koymak ilk adım.

1. **Repo ve kurallar:** "`docs/ROADMAP.md` dosyasını oku. Repo yapısı bölümündeki monorepo iskeletini oluştur (pnpm + Turborepo, TS strict, ESLint, Prettier). Ardından kök dizine bu kararları, komutları ve kod kurallarını içeren bir `CLAUDE.md` yaz."
2. **Yerel altyapı:** "PostgreSQL 16, Redis ve Mailpit içeren `docker-compose.yml` ve `.env.example` oluştur; README'ye kurulum adımlarını ekle."
3. **Web iskeleti:** "`apps/web` altında Next.js (App Router) + Tailwind + shadcn/ui kur. `(public)`, `(app)` ve `admin` rota gruplarını boş sayfalarla oluştur."
4. **Veritabanı:** "`packages/db` altında Prisma kur; ROADMAP'teki şemadan yalnızca `User`, `Consent` ve `Role` modellerini ekle, ilk migration'ı oluştur."
5. **Kimlik:** "Auth.js ile magic link (Mailpit üzerinden) ve Google girişi ekle; giriş yapmamış kullanıcıyı `(app)` rotalarından landing sayfasına yönlendir. Playwright ile kayıt-giriş e2e testi yaz."
6. **Python motoru:** "`services/engine` altında uv ile FastAPI projesi kur: `/health` endpoint'i, pytest, ruff, Dockerfile. `ENGINE_TOKEN` ile korunan bir örnek endpoint ekle."
7. **CI ve deploy:** "GitHub Actions ile lint + typecheck + test (TS ve Python) iş akışı yaz; gitleaks adımını ekle. Vercel ve Railway için deploy adımlarını `docs/deploy.md` içinde açıkla."

Bu yedi oturum Sprint 0'ı bitirir. Sonraki sprintlerde her görev maddesi doğrudan bir istem olarak verilebilir: "Sprint 1'deki 'Onboarding sihirbazı' görevini yap; kabul kriteri şu…".

**İpuçları:**

- Büyük bir göreve başlamadan önce Claude'dan plan iste, onayladıktan sonra kodlat.
- Optimizasyon motorunda önce testleri yazdır (senaryo tablosu hazır), sonra modeli.
- Her sprint sonunda bu dokümandaki kutuları işaretle; kapsam değişirse burada güncelle, `docs/ROADMAP.md`'yi yeniden ihraç et.
