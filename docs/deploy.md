# Deploy — staging (Vercel + Railway)

Sprint 0 kabulü: staging adresinde kayıt olup giriş yapılabiliyor. Bu doküman sıfırdan staging
ortamını kurar. Production (Sprint 6) aynı adımları ayrı projelerle tekrarlar.

```
Tarayıcı ──► Vercel: apps/web (Next.js) ──► Railway: PostgreSQL
                          │
                          └──► Railway: services/engine (FastAPI, ENGINE_TOKEN ile)
             SMTP sağlayıcısı ◄── magic link e-postaları
```

> **İç ağ notu:** ROADMAP motoru "iç ağ" olarak tanımlar. Vercel, Railway'in özel ağına
> erişemediği için motor Railway'de **herkese açık bir alan adıyla** yayınlanır ve her korumalı uç
> `ENGINE_TOKEN` ister (`/health` hariç). Token yoksa motor 503 döner (ADR 0004).

## 0. GitHub hazırlığı (bir kez)

Repo boş başladığı için şu an varsayılan dal `claude/sleepy-wright-aad71e`. Önce `main` oluştur:

1. GitHub → repo → **Branches** → bu dalı kaynak alarak `main` dalını oluştur.
2. **Settings → General → Default branch** → `main`.
3. **Settings → Branches → Add branch ruleset** (hedef: `main`):
   - "Require a pull request before merging"
   - "Require status checks to pass" → şu kontrolleri ekle (CI bir kez koştuktan sonra listede
     görünürler):
     `Web · lint, typecheck, test, build`, `Web · e2e (Playwright)`,
     `Engine · ruff, mypy, pytest`, `Engine · Docker image`, `Secret scan (gitleaks)`
   - "Block force pushes"

CI (`.github/workflows/ci.yml`) her dala push'ta ve fork'lardan gelen PR'larda koşar.

## 1. Railway: PostgreSQL

1. <https://railway.com> → **New Project** → **Deploy PostgreSQL** (sürüm 16).
2. Postgres servisi → **Variables** → `DATABASE_PUBLIC_URL` değerini kopyala. Vercel buna bu
   adresle bağlanır.
3. **Settings → Backups** → günlük yedeği aç. Geri yüklemeyi bir kez dene (güvenlik listesinde var).

## 2. Railway: motor (`services/engine`)

1. Aynı projede **New → GitHub Repo** → bu repo.
2. Servis **Settings**:
   - **Root Directory:** `services/engine` (Railway kökteki `Dockerfile`'ı otomatik kullanır)
   - **Watch Paths:** `services/engine/**` (web değişiklikleri motoru yeniden deploy etmesin)
   - **Healthcheck Path:** `/health`
   - **Branch:** `main`
3. **Variables:**

   | Değişken       | Değer                                                |
   | -------------- | ---------------------------------------------------- |
   | `ENGINE_TOKEN` | `openssl rand -hex 32` çıktısı (Vercel'de de aynısı) |

   `PORT` değişkenini Railway kendisi verir; imaj onu dinler.

4. **Networking → Generate Domain** → `https://<motor>.up.railway.app` adresini not et.
5. Doğrula:

   ```bash
   curl https://<motor>.up.railway.app/health                    # {"status":"ok"}
   curl -i https://<motor>.up.railway.app/info                   # 401
   curl -H "Authorization: Bearer $ENGINE_TOKEN" https://<motor>.up.railway.app/info
   ```

## 3. E-posta (SMTP)

Magic link için bir SMTP sağlayıcısı gerekir (ör. Resend, Postmark, Brevo; hepsinin SMTP arayüzü
var). Gönderen alan adı için SPF/DKIM kayıtlarını sağlayıcının yönergesine göre ekle; yoksa
e-postalar spama düşer. Gerekenler: host, port (465 → TLS), kullanıcı, şifre, gönderen adresi.

## 4. Google OAuth (opsiyonel)

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID** (Web).
2. **Authorized redirect URI:** `https://<staging-alan-adı>/api/auth/callback/google`
3. Client ID / Secret'ı Vercel'e ekle. Değişkenler boşsa Google butonu hiç görünmez.

## 5. Vercel: web (`apps/web`)

1. <https://vercel.com/new> → bu repoyu içe aktar.
2. Proje ayarları:
   - **Root Directory:** `apps/web` ("Include files outside the root directory" açık kalsın)
   - **Framework:** Next.js · **Node.js Version:** 22.x
   - **Install Command:** varsayılan (kökteki `pnpm-lock.yaml`'ı görür)
   - **Build Command:**

     ```bash
     cd ../.. && pnpm db:deploy && pnpm turbo run build --filter=@kartplan/web
     ```

     Migration'lar her build'de uygulanır (`prisma migrate deploy` idempotenttir). Turbo, build
     öncesinde Prisma istemcisini üretir.

   - **Production Branch:** `main`
3. **Environment Variables** (Production ve Preview):

   | Değişken                                      | Değer                            |
   | --------------------------------------------- | -------------------------------- |
   | `DATABASE_URL`                                | Railway `DATABASE_PUBLIC_URL`    |
   | `AUTH_SECRET`                                 | `openssl rand -base64 32`        |
   | `EMAIL_SERVER_HOST` / `EMAIL_SERVER_PORT`     | SMTP sağlayıcısı                 |
   | `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` | SMTP sağlayıcısı                 |
   | `EMAIL_FROM`                                  | `KartPlan <giris@alan-adin.com>` |
   | `ENGINE_URL`                                  | `https://<motor>.up.railway.app` |
   | `ENGINE_TOKEN`                                | Railway'dekiyle aynı             |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`       | (opsiyonel) Google OAuth         |
   | `SEED_ADMIN_EMAIL`                            | (opsiyonel) kendi e-postan       |

   `AUTH_URL` gerekmez: Auth.js Vercel'de adresi istekten alır (`trustHost`).
   Google değişkenlerini sonradan eklersen **yeniden deploy et**: buton build anında belirlenir.

4. Deploy et → `https://<proje>.vercel.app/api/health` → `{"status":"ok"}`.

> **Preview deploy'ları ve veritabanı:** Staging'de preview'lar da aynı veritabanını kullanır ve
> build sırasında migration uygular. Yıkıcı bir migration'ı önce yerelde dene. Production'da
> (Sprint 6) preview'lar için ayrı bir veritabanı kullanılacak.

## 6. Seed ve admin (bir kez)

```bash
DATABASE_URL="<Railway DATABASE_PUBLIC_URL>" SEED_ADMIN_EMAIL="sen@ornek.com" pnpm db:seed
```

## 7. Kabul kontrolü (Sprint 0)

- [ ] `https://<staging>/api/health` → `ok`
- [ ] Motor `/health` → `ok`, `/info` token olmadan 401
- [ ] Staging'de `/giris` → e-posta → gelen bağlantı → `/plan` açılıyor, e-posta başlıkta
- [ ] Çıkış yap → `/plan` landing'e yönlendiriyor
- [ ] `main` üzerinde CI yeşil

## Geri alma

- **Web:** Vercel → Deployments → önceki deploy → **Promote to Production** (anında).
- **Motor:** Railway → servis → Deployments → önceki deploy → **Redeploy**.
- **Veritabanı:** Prisma migration'ları geri alınmaz; geri dönüş için yeni bir migration yaz.
  Veri kaybı olursa Railway yedeğinden geri yükle.
