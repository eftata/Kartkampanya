# Deploy — ücretsiz staging (Vercel Hobby + Neon + Render + Brevo)

Maliyetsiz deneme ortamı. Asıl rehber [`deploy.md`](deploy.md) (Railway); bu belge yalnızca
ücretsiz katmanlara göre farkları anlatır. Sınırlar 2026-10 itibarıyla; sağlayıcıların fiyat
sayfasından teyit et.

```
Tarayıcı ──► Vercel Hobby: apps/web ──► Neon Free: PostgreSQL
                          │
                          └──► Render Free: services/engine (Docker, ENGINE_TOKEN)
             Brevo Free (SMTP) ◄── giriş e-postaları
cron-job.org ──► motor /health (uyanık tut)
```

| Parça          | Servis       | Ücretsiz sınır (özet)                               | Not                                                    |
| -------------- | ------------ | --------------------------------------------------- | ------------------------------------------------------ |
| Web            | Vercel Hobby | Ticari olmayan kullanım; cron günde en fazla 1 kez  | Ticari kullanıma geçince Pro gerekir                   |
| Veritabanı     | Neon Free    | ~0,5–1 GB depolama, 100 CU-saat/ay, 5 dk sonra uyur | Uyanma ilk sorguda < 1 sn                              |
| Motor          | Render Free  | 512 MB RAM, 750 saat/ay, 15 dk trafiksizse uyur     | Uyanma ~1 dk; aşağıdaki "uyanık tut" ile çözülür       |
| E-posta        | Brevo Free   | Günde 300 e-posta, Brevo imzası                     | Alan adı gerekmez: tek gönderen adresini doğrula       |
| Redis          | —            | Kullanılmıyor                                       | İstek sınırı sunucu belleğinde (ADR 0021); yeterli     |
| Veri hattı     | —            | Şimdilik yok                                        | Banka adaptörleri yazılınca GitHub Actions zamanlayıcı |
| Sentry/PostHog | —            | İsteğe bağlı, ikisinin de ücretsiz katmanı var      | Boşsa kapalı                                           |

## 1. Neon: PostgreSQL

1. <https://neon.com> → GitHub ile kayıt → **New Project**, Postgres 16, bölge **AWS Europe
   (Frankfurt)** (Türkiye'ye yakın).
2. **Connect** → "Connection pooling" **kapalı** (doğrudan bağlantı; Prisma migration'ları havuzda
   takılabilir) → bağlantı adresini kopyala (`postgresql://…neon.tech/neondb?sslmode=require`).
   Bu `DATABASE_URL`.

## 2. Render: motor

1. <https://render.com> → GitHub ile kayıt → **New → Web Service** → Kartkampanya reposu.
2. Ayarlar:
   - **Branch:** `main` · **Root Directory:** `services/engine` · **Runtime:** Docker
   - **Instance Type:** Free · **Health Check Path:** `/health`
   - **Environment:** `ENGINE_TOKEN` = `openssl rand -hex 32` çıktısı
3. Deploy bitince adres `https://<ad>.onrender.com`. Denetim:
   `curl https://<ad>.onrender.com/health` → `{"status":"ok"}`.
4. **Uyanık tut:** <https://cron-job.org> (ücretsiz) → yeni iş → URL
   `https://<ad>.onrender.com/health`, her 10 dakikada. Tek servis ayda ~744 saat çalışır,
   750 saatlik sınırın içinde kalır. Bu yapılmazsa planın ilk açılışı motor uyanana kadar "son
   plan" uyarısıyla gelir.

## 3. Brevo: giriş e-postaları

1. <https://www.brevo.com> → kayıt → **Senders, domains & dedicated IPs → Senders** → kendi
   e-posta adresini ekle ve doğrula.
2. **SMTP & API → SMTP** → host `smtp-relay.brevo.com`, port `587`, kullanıcı (login) ve **SMTP
   anahtarı** (şifre yerine).
3. Alan adı doğrulanmadığı için bazı e-postalar spama düşebilir; denemede "spam" klasörüne bak.

## 4. Vercel: web

[`deploy.md` → 5. Vercel](deploy.md#5-vercel-web-appsweb) ile aynı (Root Directory `apps/web`,
Node 22.x, Build Command `cd ../.. && pnpm db:deploy && pnpm turbo run build --filter=@kartplan/web`,
Production Branch `main`). Değişkenler:

| Değişken                                                   | Değer                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | Neon doğrudan bağlantı adresi                                               |
| `AUTH_SECRET`                                              | `openssl rand -base64 32`                                                   |
| `ENGINE_URL`                                               | `https://<ad>.onrender.com`                                                 |
| `ENGINE_TOKEN`                                             | Render'dakiyle aynı                                                         |
| `CRON_SECRET`                                              | `openssl rand -hex 32`                                                      |
| `EMAIL_SERVER_HOST` / `EMAIL_SERVER_PORT`                  | `smtp-relay.brevo.com` / `587`                                              |
| `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD`              | Brevo login / SMTP anahtarı                                                 |
| `EMAIL_FROM`                                               | `KartPlan <brevoda-dogruladigin@adres>`                                     |
| `APP_URL`                                                  | `https://<proje>.vercel.app` (ilk deploy'dan sonra; ekleyince **Redeploy**) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | (isteğe bağlı) anlık bildirim                                               |

`REDIS_URL` tanımlanmaz. `vercel.json`'daki iki cron günde birer kez çalışır (Hobby sınırına uygun).

## 5. Katalog ve admin (bir kez)

```bash
DATABASE_URL="<Neon adresi>" SEED_ADMIN_EMAIL="sen@ornek.com" pnpm db:seed
```

## 6. Kontrol

- `https://<proje>.vercel.app/api/status` → veritabanı ve motor `ok`, Redis `disabled`.
- `/giris` → e-posta → bağlantı → KVKK onayı → onboarding.
- `/admin` (seed'deki e-postayla) açılıyor.

## Ücretliye geçiş

Kullanıcı sayısı artınca ya da ticari kullanıma geçince: Vercel Pro, motor için uyumayan bir
örnek (Render Starter ya da Railway), Neon Launch, Brevo'da alan adı doğrulaması. Rehber:
[`deploy.md`](deploy.md), [`operations.md`](operations.md).
