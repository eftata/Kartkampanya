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
- [x] Onboarding sihirbazı: banka → program → kart seçimi (kart numarası yok), opsiyonel limit ve kesim günü — `/baslangic`; kartsız kullanıcı `/plan`dan buraya yönlenir; API: `GET /api/catalog/banks`, `GET/POST /api/me/cards`, `DELETE /api/me/cards/{id}`
- [x] Harcama profili ekranı: kategori seçimi + aylık tutar kaydırıcısı + tercih edilen markalar — onboarding 2. adımı `/baslangic/harcama` (form `components/spend-profile-form.tsx`, Profilim'de yeniden kullanılacak); profil yoksa `/plan` buraya yönlenir; API: `GET /api/catalog/categories`, `GET/PUT /api/me/spend-profile` (PUT profili bütünüyle değiştirir)
- [x] "Kartlarım" ve "Profilim" düzenleme sayfaları — `/kartlarim` (ekle / düzenle / kaldır, onboarding ile ortak `components/card-manager.tsx`), `/profil` (harcama profili + hesap bilgisi); API: `PATCH /api/me/cards/{id}`
- [x] Admin: katalog CRUD (banka/program/kart/kazanç oranı), rol tabanlı erişim — `/admin/katalog` (program ve kart sayfalarında "kaynaktan doğrulandı" işareti), `requireAdmin` / `withAdmin`, işlem kaydı (`AdminAuditLog`); ADR 0006

**Kabul:** yeni kullanıcı 3 dakikadan kısa sürede kartlarını ve harcama profilini girebiliyor.

### Sprint 2 — Kampanya veri hattı v1

- [x] Şema: `Campaign`, `CampaignRule`, `CampaignSource`, `PipelineRun` — kart kapsamı `CampaignCard` ara tablosu; ADR 0007
- [ ] Adaptör arayüzü + ilk 2 adaptör (örn. World ve Bonus): liste sayfası → detay sayfası → ham metin — **arayüz tamam** (`BankAdapter`, `PoliteFetcher`, tarih/metin yardımcıları; ADR 0008). World ve Bonus adaptörleri bekliyor: geliştirme ortamının ağ politikası banka sitelerini engelliyor, seçiciler gerçek HTML görülmeden yazılmaz.
- [x] Değişiklik tespiti: metin hash'i aynıysa yeniden ayıklama yapma — `content_hash` (başlık + tarih + boşluk farkları yok sayılan metin), `run_source` (yeni/değişmedi/değişti; değişen yayındaki kampanya DRAFT'a çekilir), `CampaignStore` (psycopg); ADR 0009
- [x] LLM ayıklama: ham metin → `CampaignRule[]` JSON + güven skoru (şema doğrulamalı) — `extract.py`: Claude API yapılandırılmış çıktı (kategori/marka katalogdan `enum`), pydantic doğrulaması, geçersizse hatalarla bir kez yeniden deneme, ret için sunucu tarafı yedek model; `CampaignStore.load_catalog`; ADR 0010. Kayıt: `run_source` ayıklananları `Campaign` + `CampaignRule` olarak tek işlemde DRAFT yazar (değişen kampanyanın yeni özeti yalnızca ayıklama başarılıysa yazılır, başarısızsa ertesi gün yeniden denenir); günlük iş `python -m engine.pipeline`; ADR 0011
- [ ] 30 elle etiketlenmiş kampanyalık test seti; ayıklama doğruluğu raporu — **araç tamam** (`python -m engine.evaluation export | run | score`: onaylı kampanyalardan vaka yazımı, alan bazında puanlama, `eval/report.md`; ADR 0013). Set bekliyor: gerçek kampanya metinleri gerekiyor (banka siteleri bu ortamda engelli; adaptörler + 30 kampanyanın kaynakla doğrulanarak onaylanması)
- [x] Admin onay kuyruğu: ham metin ile ayıklanan kurallar yan yana, düzenle → onayla / reddet — `/admin/kampanyalar` (bekleyen / onaylanan / reddedilen sekmeleri) ve `/admin/kampanyalar/[id]` (LLM'in belirsiz alanları işaretli; kurallar, kart kapsamı, katılım ve tarihler düzenlenir); API: `GET /api/admin/review-queue`, `PUT /api/admin/campaigns/{id}` (`save` / `approve` / `reject`); her karar `AdminAuditLog`'a; ADR 0012

**Kabul:** 2 programdan günlük iş çalışıyor; test setinde eşik ve ödül alanları ≥ %85 doğru; onaylanan kampanya yayına giriyor.

### Sprint 3 — Kişisel kampanya listesi

- [ ] Kalan 3 adaptör; süresi dolan kampanyaları otomatik kapatma — **kapatma tamam**: günlük iş (`python -m engine.pipeline`) taramadan sonra bitiş günü geçmiş (Türkiye takvimi, `endsAt` dahil) onaylı ve taslak kampanyaları `EXPIRED` yapar, reddedilenlere dokunmaz (ADR 0011). Adaptörler bekliyor (banka siteleri bu ortamda engelli)
- [x] Eşleştirme servisi: kullanıcının kartları × seçtiği kategoriler × aktif kampanyalar — `lib/campaign-match.ts` (saf kurallar: kart kapsamı, ana kategoriye indirgeme, kaba kazanç tahmini) + `lib/campaigns.ts → getMyCampaigns`; API: `GET /api/me/campaigns?card=&category=&type=&sort=ends|gain`; ADR 0014
- [x] Kampanyalar sayfası: filtre (kart, kategori, fayda tipi), sıralama (bitiş tarihi, tahmini kazanç) — `/kampanyalarim`; filtreler URL'de (`?kart=&kategori=&tur=puan|iade|indirim|taksit&sirala=bitis|kazanc`, `next/form` ile istemci gezinmesi, JS'siz de çalışır); kart/profil yoksa onboarding'e yönlendiren boş durum
- [x] Etiketler: "katılım gerekli", "bitmek üzere", "plana dahil" — katılım yöntemiyle birlikte; ayrıca "Katıldın", "Başlangıç: …" ve fayda tipi. "Plana dahil" `UserCampaignStatus.inPlan`'dan okunur; bu alanı Sprint 4'te plan yazacak (şimdilik yalnızca API ile)
- [x] "Katıldım" işaretleme (`UserCampaignStatus`) ve bankanın kampanya sayfasına link — kampanya kartında "Katıldım olarak işaretle" düğmesi (katılım gerektiren kampanyalarda; anında değişir, hata olursa geri alır) ve "Katıldın" etiketi; API: `PATCH /api/me/campaigns/{id}` (`joined` / `inPlan`); yalnızca onaylı ya da süresi dolmuş kampanyalar işaretlenebilir
- [x] Kampanya detay: 3 maddelik sade özet + kaynak bağlantısı — `/kampanyalarim/[id]`: özet (yoksa kuralların sade hali), koşullar sade Türkçe (`lib/campaign-describe.ts`: eşik, ödül, kapsam, üst limit, hariçler), geçerli kartlar, tarihler ve "Katıldım", kullanıcıya uyup uymadığı ve tahmin, bankanın sayfası + son görülme tarihi. Onaylı ve süresi dolmuş kampanyalar açılır; taslak/reddedilen 404

**Kabul:** kullanıcı yalnızca kendi kartlarına ve alanlarına uyan kampanyaları görüyor; 5 programdan veri akıyor.

### Sprint 4 — Optimizasyon motoru

- [x] `packages/shared`: `PlanRequest` / `PlanResponse` zod şemaları → JSON Schema → pydantic — `pnpm plan:gen`; üretilenler commit'li, iki tarafta senkron testi; ADR 0015
- [x] CP-SAT modeli: bütçe dağılımı, kart limiti, kademeli eşik, üst limit, katılım durumu — `engine/optimizer/cpsat.py` (+ `maxCards`, tek seferlik / işlem adedi eşiği, oransal ödül); `POST /optimize`
- [x] TL tamsayı ölçeğinde çözüm (CP-SAT tamsayı ister), 2 sn zaman aşımı + açgözlü yedek algoritma — gösterilen sayılar kuruş cinsinden kesin yeniden hesap (`problem.py`); yedek `greedy.py`
- [x] Birim testleri: ürün dokümanındaki örnek (beklenen 665 TL) dahil 10 senaryo — `tests/test_optimizer.py`. Not: ürün dokümanının K2/K3 kampanyaları elde yok; ROADMAP'teki sonuçlarla tutarlı yeniden kurgu kullanıldı, asıl değerler gelince güncellenecek
- [x] "Bu ayın planı" sayfası: kategori başına kart + tutar + kampanya, toplam beklenen kazanç, "her şeyi tek kartla ödeseydin" kıyası — `/plan`; ayrıca katılım hatırlatması ("Katıldım"), limit uyarısı, "Az kaldı". Plan isteği `lib/plan-request.ts` (çok kurallı kampanya → `group`, ay penceresine göre eşik ölçekleme); ADR 0016
- [x] Plan `MonthlyPlan` olarak saklanır; profil veya kampanya değişince yeniden hesaplanır — kullanıcı + ay başına tek kayıt; plan isteğinin kanonik özeti (`inputHash`) aynıysa motor çağrılmaz, değişince (kart, limit, profil, kampanya, katılım) yeniden hesaplanır; her hesaplamada "plana dahil" işaretleri eşitlenir; motora ulaşılamazsa son plan uyarıyla. API: `GET /api/me/plan?month=`, `POST /api/me/plan/recompute`; sayfada "Yeniden hesapla"; ADR 0017

**Kabul:** 10 test senaryosu geçiyor; gerçek kullanıcı verisiyle plan 1 saniyenin altında geliyor.

### Sprint 5 — Bildirim, KVKK, vitrin

- [x] E-posta: katılım hatırlatma (kampanya başlangıcında), son 3 gün uyarısı, haftalık plan özeti — günlük iş `GET /api/cron/notifications` (Vercel Cron, `CRON_SECRET`), `NotificationLog` ile tek sefer, kullanıcı başına tür başına toplu e-posta; ADR 0018
- [x] Bildirim tercihleri ve tek tıkla abonelikten çıkma — Profilim → "E-posta bildirimleri" (`/profil#bildirimler`), API `GET/PUT /api/me/notifications`; tek tıkla çıkma: imzalı bağlantı, `/abonelik` onay sayfası, `List-Unsubscribe-Post`; ADR 0018
- [x] KVKK: aydınlatma metni, açık rıza kaydı (versiyonlu), veri indirme, hesap silme — `/aydinlatma` (taslak, hukuki inceleme bekliyor), `/onay` kapısı (aydınlatma + yurt dışı aktarım açık rızası zorunlu, pazarlama ayrı), Profilim → "Verilerin ve gizlilik", `GET /api/me/export`, `DELETE /api/me`, 30 gün sonra kalıcı silme (`/api/cron/purge-accounts`); ADR 0019
- [x] Landing page + herkese açık kampanya sayfaları (SEO), sitemap — landing: "Nasıl çalışır?", güvenceler, çağrı; `/kampanyalar` (onaylı ve süresi geçmemiş kampanyalar, program ve kategori filtresi URL'de), detay `/kampanyalar/<başlık-slug>-<id>` (kanonik adres, eski başlık yönlenir, süresi dolan `noindex`, taslak/reddedilen 404, Open Graph), `sitemap.xml` + `robots.txt` (kişisel sayfalar, admin ve API kapalı); kök adres `APP_URL`; ADR 0020
- [x] Rate limiting, güvenlik başlıkları, hata takibi (Sentry), ürün analitiği (PostHog) — istek sınırı ve başlıklar ADR 0021; Sentry (web sunucu + tarayıcı, motor API + veri hattı; yalnızca hatalar, kullanıcı/çerez/gövde silinir, e-posta ve uzun rakam dizileri maskelenir) ve PostHog (AB; tarayıcıda çerezsiz anonim sayfa görüntüleme, adres parametreleri izin listesiyle; sunucudan takma adlı huni olayları: kayıt → kart → harcama profili → plan → katılım) ADR 0022; DSN/anahtar yoksa kapalı

**Kabul:** güvenlik ve KVKK kontrol listesi (aşağıda) tamamen işaretli.

### Sprint 6 — Kapalı beta

- [ ] Production ortamı, yedekleme, izleme panosu — **kod tarafı tamam**: herkese açık bileşen durumu `GET /api/status` (veritabanı, Redis, motor; çalışamıyorsa 503), zamanlanmış iş kaydı `JobRun` (bildirim, hesap temizliği; Sentry'ye hata), admin "Sistem durumu" panosu `/admin/durum` (bileşenler, işler + veri hattı kaynakları ve gecikme, onay kuyruğu, kampanya/kullanıcı/e-posta/plan sayıları); production kurulum, yedek ve geri yükleme tatbikatı, uyarılar `docs/operations.md`; ADR 0023. **Bekleyen (hesap gerektirir):** production projeleri ve alan adı, yedek tatbikatı, uptime izleyici
- [ ] 20–50 davetli kullanıcı (Genç Finans Kulüp, çevre) ve geri bildirim formu — **geri bildirim formu tamam**: üst menüde "Geri bildirim" (açıldığı sayfayı iletir) → `/geri-bildirim` (konu: hata / öneri / yanlış kampanya-kart bilgisi / diğer, isteğe bağlı 1–5 puan, mesaj; kart numarası reddedilir; kullanıcı başına saatte 10), "Gönderdiklerin" listesi durumla; API `GET/POST /api/me/feedback`; admin gelen kutusu `/admin/geri-bildirim` (yeni / okundu / tamamlandı, e-postayla yanıt, işlem kaydı); veri kopyasında yer alır, hesapla silinir; ADR 0024. **Davet sistemi ertelendi** (2026-10-18 kararı): kayıt şimdilik herkese açık, davetliler bağlantıyla yönlendirilir; kapalı kayıt (davetli e-posta listesi / davet kodu) gerekirse sonra eklenecek
- [x] Huni ölçümü: kayıt → kart girdi → planı gördü → 2. hafta geri döndü — admin `/admin/huni` (toplam + kayıt haftasına göre kohortlar; kayıt = ilk açık rıza, 2. hafta = kayıttan sonraki 7–13. günlerden birinde kullanım, 14 gün dolmadan "henüz ölçülemez"); kaynak kendi veritabanımız: `User.firstCardAt`/`firstPlanViewAt`, kullanım günleri `UserActivityDay` (180 gün saklanır, veri kopyasında); PostHog'da aynı adımlar takma adlı olay olarak; ADR 0025
- [ ] Hata düzeltme ve kampanya veri doğruluğu iyileştirmeleri — **veri doğruluğu araçları tamam** (ADR 0026): onay öncesi otomatik kontroller (ödül ≥ eşik, üst limit < kademe ödülü, eşik 0 + tekrar, son katılım > bitiş → onay engellenir; şüpheli oran/oran, limitsiz tekrar, kapsamsız kural, uzun/uzak tarih → uyarı; formda canlı), mükerrer adayı (aynı program, çakışan tarih, benzer başlık), kampanya sayfasından "yanlış bilgi bildir" (`Feedback.campaignId`; admin kampanya sayfasında ve panoda), panoda kaynakta artık görünmeyen yayındaki kampanyalar. Beta geri bildirimlerinden gelecek hata düzeltmeleri sürüyor

**Kabul (Kapı 1):** kullanıcılar planı görüyor ve geri dönüyor mu? Evet ise Faz 2'ye geçilir.

### Faz 2 — Takip (Sprint 7–12)

- [x] Manuel harcama girişi + eşik ilerleme çubuğu + kalan bütçeyle yeniden planlama — `/harcamalar` (kart, ana kategori, isteğe bağlı marka, tutar, tarih; son 90 gün, ileri tarih yok; bu ayın listesi ve kategori başına plan/harcanan çubukları), API `GET/POST /api/me/transactions`, `DELETE /api/me/transactions/{id}`; plan sayfasında "Kampanya ilerlemen" (kural başına çubuk: kalan tutar/adet, kazanılan kademe ve tahmini ödül, üst limit); bu ay harcama varsa plan ayın kalanı için kurulur (bütçe ve kart limitinden harcanan düşer, pencere bugünden, kazanılan kural çıkar, tekrarsız kuralın eşiği kalan tutara iner, üst limitten kazanılan düşer); ADR 0027. Not: Kapı 1 (beta ölçümü) beklenmeden başlandı
- [ ] Ekstre PDF yükleme → işlem çıkarma (banka başına ayrıştırıcı) — **altyapı ve genel ayrıştırıcı tamam**: `/harcamalar/ekstre` (kart + PDF ≤ 4 MB + gerekirse parola) → motor `POST /statements/parse` (pypdf, durumsuz; ödeme/iade/toplam satırları atlanır, kart numarası açıklamadan silinir, taksit işaretlenir) → onay ekranı (marka/kategori önerisi, mükerrer ve 90 gün dışı satırlar seçili gelmez) → `Transaction (source = STATEMENT)`; PDF, metin, açıklama ve parola saklanmaz; ADR 0028. **Bekleyen:** banka başına ayrıştırıcılar gerçek (anonimleştirilmiş) ekstre örnekleri gerektirir
- [x] Ay sonu raporu: kazanılan / kaçırılan — `/plan/rapor?ay=` (ay seçici; kazanılan: o ay biten kampanyalardan ödül + kart temel puanı; kaçırılan: eşiğe ulaşılamayan ve katılmadığın için kaçırılan kampanyalar; plan beklentisiyle kıyas; ay bitmediyse "şimdiye kadar"), API `GET /api/me/report?month=`, ayın 1'inde rapor e-postası (`MONTHLY_REPORT`, yalnızca o ay harcama girildiyse; Profilim'den kapatılabilir), kapanan ayda `MonthlyPlan.realizedKurus` yazılır; ADR 0029
- [x] Tek alışveriş hesaplayıcı ("4.000 TL telefon, hangi kart?") — `/hesapla` (menüde "Hangi kart?"; tutar, ana kategori, isteğe bağlı marka ve tarih ≤ 90 gün; kart başına temel kazanç + kampanyalarda bu alışverişin marjinal kazancı, mevcut harcamalar ve katılımlarla; katılım gereken kampanya "katılırsan" olarak ayrı; limiti yetmeyen kart sona; hiçbir şey kaydedilmez), API `POST /api/me/purchase-advice`; ADR 0030
- [x] PWA + web push — ana ekrana eklenebilir uygulama (`app/manifest.ts`, simgeler `public/icons/`, başlangıç `/plan`, kısayollar), servis çalışanı `public/sw.js` (bağlantı yokken `offline.html`; kişisel sayfa önbelleğe alınmaz), Profilim → Bildirimler → "Bu cihazda anlık bildirim" (aç / deneme / kapat; iPhone'da ana ekrana ekleme yönlendirmesi); e-posta bildirimlerinin kısa hâli aynı tercihlerle push açık cihazlara da gider (VAPID, uçtan uca şifreli, push servisi izin listesi, 404/410'da abonelik silinir, kullanıcı başına 10 cihaz); API `GET/POST/DELETE /api/me/push`, `POST /api/me/push/test`; veri kopyası ve aydınlatma metni güncel; ADR 0031
- [x] Kullanıcı hata bildirimi ("bu kampanya yanlış") — Sprint 6'da yapıldı (ADR 0026)

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
  firstCardAt     DateTime? // huni: ilk kart (ADR 0025)
  firstPlanViewAt DateTime? // huni: planı ilk görme
  cards        UserCard[]
  spend        SpendProfile[]
  consents     Consent[]
  plans          MonthlyPlan[]
  campaignStatus UserCampaignStatus[]
  notifyPrefs  Json     @default("{}")
}
enum Role { USER ADMIN }

model Consent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind      String   // "kvkk_aydinlatma" | "acik_riza_yurtdisi" | "pazarlama"
  version   String
  granted   Boolean
  createdAt DateTime @default(now())
  @@index([userId, kind, createdAt])
}

model Bank {
  id       String    @id @default(cuid())
  name     String    @unique
  programs Program[]
}

model Program {
  id                   String           @id @default(cuid())
  bankId               String
  bank                 Bank             @relation(fields: [bankId], references: [id])
  slug                 String           @unique // "bonus", "world" — veri hattı adaptörleri bununla eşleşir
  name                 String // Bonus, Maximum, World ...
  pointName            String // Bonus, MaxiPuan, Worldpuan
  pointValueTL         Decimal          @default(1) @db.Decimal(10, 4) // 1 puan = ? TL
  // null = puan değeri doğrulanmadı (seed tahmini); admin kaynaktan doğrulayınca tarih yazılır.
  pointValueVerifiedAt DateTime?
  cards                CardProduct[]
  campaigns            Campaign[]
  sources              CampaignSource[]

  @@unique([bankId, name])
}

model CardProduct {
  id              String         @id @default(cuid())
  programId       String
  program         Program        @relation(fields: [programId], references: [id])
  name            String // Bonus Platinum
  type            CardType
  annualFee       Int? // kuruş
  baseRateBps     Int            @default(0) // kampanyasız, tüm harcamalara uygulanan temel oran
  earnRates       EarnRate[] // kategoriye özel oranlar (temel oranın yerine geçer)
  // null = baseRateBps ve earnRates doğrulanmadı (seed tahmini); admin doğrulayınca tarih yazılır.
  ratesVerifiedAt DateTime?
  userCards       UserCard[]
  campaigns       CampaignCard[]

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

// --- Kampanyalar (Sprint 2): veri hattı DRAFT yazar, admin onaylar (APPROVED) ---
// Python veri hattı bu tablolara okur/yazar ama şemayı değiştirmez (ADR 0007).

// Bir programın kampanya listesi kaynağı; her banka adaptörü bir kayıttır.
model CampaignSource {
  id        String        @id @default(cuid())
  programId String
  program   Program       @relation(fields: [programId], references: [id])
  adapter   String        @unique // services/engine/engine/pipeline/adapters/<adapter>.py
  listUrl   String
  active    Boolean       @default(true)
  createdAt DateTime      @default(now())
  campaigns Campaign[]
  runs      PipelineRun[]
}

model Campaign {
  id              String          @id @default(cuid())
  programId       String
  program         Program         @relation(fields: [programId], references: [id])
  sourceId        String? // null = admin elle ekledi
  source          CampaignSource? @relation(fields: [sourceId], references: [id])
  cardScope       CampaignCard[] // boş = programdaki tüm kartlar
  title           String
  sourceUrl       String          @unique
  rawText         String
  rawHash         String // content_hash: başlık+tarih+metin sha256; aynıysa yeniden ayıklanmaz
  summary         String[] // en fazla 3 sade madde
  startsAt        DateTime
  endsAt          DateTime
  joinMethod      JoinMethod
  joinDeadline    DateTime?
  status          CampaignStatus  @default(DRAFT)
  confidence      Float? // LLM güven skoru 0–1 (para değil)
  uncertainFields String[] // LLM'in emin olmadığı alanlar; onay kuyruğunda vurgulanır
  rules           CampaignRule[]
  userStatus      UserCampaignStatus[]
  lastSeenAt      DateTime        @default(now()) // kaynak listesinde en son görüldüğü an
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status, endsAt])
  @@index([programId, status])
}

enum JoinMethod {
  AUTO
  SMS
  APP
  WEB
}

enum CampaignStatus {
  DRAFT
  APPROVED
  REJECTED
  EXPIRED
}

// Kampanyanın geçerli olduğu kart ürünleri. Kampanyaya bağlı kart ürünü silinemez: silinseydi
// kapsam sessizce boşalıp "tüm kartlar" anlamına gelirdi.
model CampaignCard {
  campaignId    String
  campaign      Campaign    @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  cardProductId String
  cardProduct   CardProduct @relation(fields: [cardProductId], references: [id], onDelete: Restrict)

  @@id([campaignId, cardProductId])
}

model CampaignRule {
  id             String    @id @default(cuid())
  campaignId     String
  campaign       Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  categoryIds    String[] // Category.id; boş = tüm harcamalar
  merchantIds    String[] // Merchant.id; boş = kategorideki tüm markalar
  thresholdType  Threshold // SINGLE (tek seferde) | CUMULATIVE (toplam) | TXN_COUNT (işlem adedi)
  thresholdKurus Int?
  txnCount       Int?
  tierRepeat     Boolean   @default(false) // "her 2.500 TL'ye" — eşik tekrarlanır
  rewardType     Reward
  rewardKurus    Int? // sabit ödül
  rewardBps      Int? // oransal ödül
  capKurus       Int? // üst limit
  exclusions     String[] // "taksitli", "nakit_avans" ...

  @@index([campaignId])
}

enum Threshold {
  SINGLE
  CUMULATIVE
  TXN_COUNT
}

enum Reward {
  POINTS
  CASHBACK
  DISCOUNT
  INSTALLMENT
}

model PipelineRun {
  id         String            @id @default(cuid())
  sourceId   String
  source     CampaignSource    @relation(fields: [sourceId], references: [id])
  status     PipelineRunStatus @default(RUNNING)
  startedAt  DateTime          @default(now())
  finishedAt DateTime?
  found      Int               @default(0) // listede bulunan kampanya
  changed    Int               @default(0) // yeni ya da metni değişen (yeniden ayıklanan)
  errors     Json? // [{ url, message }]

  @@index([sourceId, startedAt])
}

enum PipelineRunStatus {
  RUNNING
  SUCCEEDED
  FAILED
}

// Web'deki zamanlanmış işlerin (Vercel Cron) çalışma kaydı; izleme panosu (ADR 0023)
model JobRun {
  id         String       @id @default(cuid())
  name       String // "notifications" | "purge-accounts"
  status     JobRunStatus @default(RUNNING)
  startedAt  DateTime     @default(now())
  finishedAt DateTime?
  summary    Json? // sayılar; kişisel veri yok
  error      String? // kısa hata mesajı (temizlenmiş)

  @@index([name, startedAt])
}

enum JobRunStatus {
  RUNNING
  SUCCEEDED
  FAILED
}

// Huni ölçümü (ADR 0025): kullanım günleri; User.firstCardAt / firstPlanViewAt ile birlikte
model UserActivityDay {
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  day    String // "2026-11-03" (Türkiye takvimi); 180 günden eskiler silinir

  @@id([userId, day])
}

// Kapalı beta geri bildirimi (ADR 0024); kullanıcıyla birlikte silinir
model Feedback {
  id        String         @id @default(cuid())
  userId    String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind      FeedbackKind // BUG | IDEA | DATA | OTHER
  rating    Int? // 1–5
  message   String // ≤ 2000; kart numarası reddedilir
  page      String? // yalnızca yol
  campaignId String? // "bu kampanya yanlış" (ADR 0026); kampanya silinirse boşalır
  status    FeedbackStatus @default(NEW) // NEW | READ | DONE
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
}

// --- Admin işlem kaydı: kim, neyi, ne zaman değiştirdi / doğruladı (güvenlik listesi) ---
// Kayıtlar silinmez; admin hesabı silinse bile kalır (actorId boşalır, actorEmail saklanır).

model AdminAuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  actor      User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  actorEmail String
  action     String // "bank.create", "card.update", "card.verify_rates" ...
  entityType String // "Bank" | "Program" | "CardProduct" | "Campaign"
  entityId   String
  data       Json     @default("{}") // değişen alanlar (önce/sonra)
  createdAt  DateTime @default(now())

  @@index([entityType, entityId, createdAt])
  @@index([createdAt])
}

// Kullanıcının kampanyayla ilişkisi (Sprint 3): "Katıldım" ve plana dahil. Satır ilk işarette oluşur.
model UserCampaignStatus {
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaignId    String
  campaign      Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  joined        Boolean  @default(false)
  joinedAt      DateTime?
  inPlan        Boolean  @default(false) // Sprint 4: plan yazar
  progressKurus Int      @default(0)     // Faz 2: işlem takibi
  updatedAt     DateTime @updatedAt
  @@id([userId, campaignId])
}

// Aylık plan (Sprint 4): kullanıcı ve ay başına son plan; inputHash aynıysa yeniden hesaplanmaz.
model MonthlyPlan {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  month         String   // "2026-11"
  input         Json     // PlanRequest
  inputHash     String   // sha256(kanonik input)
  result        Json     // PlanResponse
  expectedKurus Int
  baselineKurus Int
  realizedKurus Int?     // Faz 2
  computedAt    DateTime
  createdAt     DateTime @default(now())
  @@unique([userId, month])
}
```

Faz 2 (ADR 0027): `Transaction` — kullanıcı, kart (`UserCard`, kart kaldırılınca silinir), ana
kategori, isteğe bağlı marka, `amountKurus`, `date` (Türkiye günü), `source` (`MANUAL` |
`STATEMENT`). Kampanya ilerlemesi buradan hesaplanır (saklanmaz; `progressKurus` kullanılmıyor).

Faz 2 (ADR 0031): `PushSubscription` — kullanıcı, `endpoint` (benzersiz; push servisi adresi),
`p256dh`, `auth`, `createdAt`, `lastSentAt`; kullanıcıyla silinir.

## API sözleşmesi

Tüm endpoint'ler `apps/web/app/api` altındadır, istek/yanıt gövdeleri `packages/shared` içindeki zod şemalarıyla doğrulanır. Python motoru dışarıya açılmaz; yalnızca web sunucusu çağırır.

| Yöntem                      | Yol                                                                      | Ne yapar                                  | Sprint |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------ |
| GET                         | `/api/catalog/banks`                                                     | Banka → program → kart ağacı (onboarding) | 1      |
| GET                         | `/api/catalog/categories`                                                | Kategori ve marka listesi                 | 1      |
| GET / POST / PATCH / DELETE | `/api/me/cards`, `/api/me/cards/{id}`                                    | Kullanıcının kartları                     | 1      |
| GET / PUT                   | `/api/me/spend-profile`                                                  | Kategori başına aylık tutar ve markalar   | 1      |
| GET                         | `/api/me/campaigns?card=&category=&type=&sort=`                          | Kişiye eşleşen aktif kampanyalar          | 3      |
| PATCH                       | `/api/me/campaigns/{id}`                                                 | `joined` / `inPlan` işaretleme            | 3      |
| GET                         | `/api/me/plan?month=2026-11`                                             | Kayıtlı plan (yoksa hesaplar)             | 4      |
| POST                        | `/api/me/plan/recompute`                                                 | Planı yeniden hesapla                     | 4      |
| GET / PUT                   | `/api/me/notifications`                                                  | Bildirim tercihleri                       | 5      |
| GET                         | `/api/me/export`                                                         | KVKK veri indirme (JSON)                  | 5      |
| GET / POST / DELETE         | `/api/me/push`                                                           | Web push cihaz kaydı (Faz 2)              | F2     |
| POST                        | `/api/me/push/test`                                                      | Deneme push bildirimi                     | F2     |
| DELETE                      | `/api/me`                                                                | Hesap silme (30 gün içinde kalıcı)        | 5      |
| GET                         | `/api/admin/review-queue`                                                | Onay bekleyen kampanyalar                 | 2      |
| PUT                         | `/api/admin/campaigns/{id}`                                              | Kural düzenle, onayla / reddet            | 2      |
| CRUD                        | `/api/admin/catalog`, `/api/admin/catalog/{banks,programs,cards}[/{id}]` | Banka, program, kart, kazanç oranı        | 1      |
| POST                        | `engine:/optimize` (iç ağ)                                               | `PlanRequest` → `PlanResponse`            | 4      |
| POST                        | `engine:/pipeline/run` (iç ağ, cron)                                     | Adaptörleri çalıştırır                    | 2      |

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

Uygulanan sözleşmeye eklenenler (ADR 0015): kampanyada isteğe bağlı `txnCount` (işlem adedi eşiği),
`rewardBps` (oransal ödül) ve `group` (aynı gruptan yalnızca en yüksek ödül sayılır: bir kampanyanın
alternatif kademeleri); `options` isteğe bağlı. Yanıtta `unallocated` (kart limitleri
yetmeyen harcama) ve `baseline.card`; `status` `OPTIMAL | FEASIBLE | FALLBACK`.

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
# services/engine/engine/pipeline/adapters/base.py (özet)
@dataclass(frozen=True)
class RawCampaign:
    source_url: str
    title: str
    raw_text: str
    starts_at: date | None
    ends_at: date | None

class BankAdapter(ABC):
    adapter: ClassVar[str]   # CampaignSource.adapter: "world", "bonus" ...
    program: ClassVar[str]   # Program.slug
    list_url: ClassVar[str]

    # Adaptör yalnızca HTML ayrıştırır; ağ işini PoliteFetcher yapar (robots, ≥ 2 sn, User-Agent).
    def parse_list(self, html: str, base_url: str) -> list[str]: ...
    def parse_detail(self, html: str, url: str) -> RawCampaign: ...

    async def list_urls(self, fetcher: Fetcher) -> list[str]: ...   # mutlak, tekil, aynı site
    async def fetch(self, fetcher: Fetcher, url: str) -> RawCampaign: ...
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
- [x] Rate limiting (giriş, magic link, plan hesaplama) — ADR 0021
- [x] Admin rotaları rol kontrolü + işlem kaydı (kim neyi onayladı) — katalog ve kampanya onay/ret/düzenleme işlemleri (`entityType = "Campaign"`)
- [x] Güvenlik başlıkları (CSP, HSTS), HTTPS zorunlu — `lib/security-headers.ts`; Vercel http→https yönlendirir, HSTS + `upgrade-insecure-requests`; ADR 0021
- [ ] Bağımlılık taraması (Dependabot / Renovate)
- [ ] Günlük veritabanı yedeği + geri yükleme bir kez denendi

### KVKK

- [ ] Aydınlatma metni ve gizlilik politikası yayında (avukat kontrolünden geçmiş) — taslak `/aydinlatma`'da; avukat kontrolü ve veri sorumlusu bilgileri bekliyor
- [x] Açık rıza versiyonlu kaydediliyor (`Consent`), pazarlama rızası ayrı
- [x] Veri indirme (`/api/me/export`) ve hesap silme çalışıyor
- [x] Veri saklama süresi tanımlı; silinen hesaplar 30 gün sonra kalıcı silinir
- [x] Analitik araçları kişisel veri almadan (e-posta, isim) çalışıyor — takma adlı kimlik (HMAC), çerez yok, adres parametreleri temizlenir; e2e sahte toplayıcıyla doğrular (ADR 0022). PostHog projesinde "Discard client IP data" açılmalı
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
