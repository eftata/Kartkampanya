# İşletim — production, yedekler, izleme

Staging kurulumu [`deploy.md`](deploy.md)'dedir; production aynı adımlarla, **ayrı** projelerle
kurulur. Bu belge farkları, yedek/geri yükleme tatbikatını ve izlemeyi anlatır (ADR 0023).

## 1. Production ortamı

| Parça      | Staging                           | Production                                |
| ---------- | --------------------------------- | ----------------------------------------- |
| Web        | Vercel Preview (`claude/*` vb.)   | Vercel Production (`main`), özel alan adı |
| Veritabanı | Railway projesi `kartplan-stg`    | Ayrı Railway projesi `kartplan-prod`      |
| Motor + iş | Staging Railway servisleri        | Production Railway servisleri             |
| Redis      | Staging Redis                     | Production Redis                          |
| Sentry     | `environment=staging`             | `environment=production` (aynı projeler)  |
| PostHog    | Ayrı proje (test verisi karışmaz) | Production projesi                        |

Kontrol listesi:

1. Railway'de yeni proje: PostgreSQL 16 (yedekler açık), Redis, motor ve veri hattı işi
   (`deploy.md` §1–2b). Production `ENGINE_TOKEN`, `CRON_SECRET`, `AUTH_SECRET` staging'den
   **farklı** üretilir (`openssl rand`).
2. Vercel'de ortam değişkenlerini **Production** kapsamına gir (Preview'dakiler staging'e
   bakmaya devam eder). `APP_URL` = `https://<alan-adı>`; `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`.
3. Alan adı: Vercel → Domains. HTTPS ve HSTS otomatik (ADR 0021). Google OAuth'a production
   yönlendirme adresini ekle (`https://<alan-adı>/api/auth/callback/google`).
4. E-posta: SMTP sağlayıcısında alan adını doğrula (SPF, DKIM, DMARC); `EMAIL_FROM` bu alan adından.
5. GitHub: `main` için ruleset (CI zorunlu, doğrudan push yok). Production deploy yalnızca `main`.
6. İlk kurulum: `DATABASE_URL=<prod> SEED_ADMIN_EMAIL=<sen> pnpm db:seed` (katalog + admin).
7. İzleme (§3) ve ilk yedek tatbikatı (§2) yapılmadan davet gönderilmez.

## 2. Yedekler ve geri yükleme tatbikatı

- **Otomatik yedek:** Railway → Postgres → **Backups** → günlük; saklama en az 7 gün. Yedekler
  Railway'de (aynı bölge) kalır; kişisel veri içerdiği için başka yere (ör. GitHub artifact)
  kopyalanmaz.
- **Elle yedek** (riskli migration öncesi):

  ```bash
  pg_dump "$PROD_DATABASE_URL" --format=custom --no-owner --file kartplan-$(date +%F).dump
  ```

  Dosya şifreli disk dışında tutulmaz, işi bitince silinir.

- **Geri yükleme tatbikatı** (beta öncesi bir kez, sonra üç ayda bir; ROADMAP güvenlik listesi):
  1. Railway'de geçici bir Postgres servisi aç (ya da yerelde `docker compose`).
  2. Son yedeği oraya geri yükle (Railway: Backups → **Restore** hedefi yeni servis; elle:
     `pg_restore --no-owner --dbname "$TEMP_URL" kartplan-YYYY-MM-DD.dump`).
  3. Kontrol: `DATABASE_URL=$TEMP_URL pnpm --filter @kartplan/db exec prisma migrate status`
     (tüm migration'lar uygulanmış), `pnpm db:studio` ile kullanıcı/kart/kampanya sayıları
     production paneliyle (`/admin/durum`) tutarlı.
  4. Süreyi not et (hedef: 30 dk içinde geri dönülebilir). Geçici servisi sil.
  5. Tarihi ve sonucu ROADMAP → Güvenlik → "Günlük veritabanı yedeği + geri yükleme" satırına yaz.

## 3. İzleme

- **Admin paneli:** `/admin/durum` — bileşenler, zamanlanmış işler (bildirim, hesap temizliği,
  veri hattı kaynakları) ve gecikmeleri, onay kuyruğu, son 24 saat sayıları. Her sabah bakılır.
- **Uptime izleyici** (ör. Better Stack, UptimeRobot — ücretsiz katman yeter):
  - `GET https://<alan-adı>/api/status` her 1–5 dk; 503 ya da zaman aşımı → e-posta/SMS.
    Yanıt yalnızca `ok/down/disabled` döner, adres ya da hata ayrıntısı içermez.
  - `GET https://<alan-adı>/api/health` (yalnızca süreç canlılığı) isteğe bağlı.
- **Sentry uyarıları:** her iki projede "yeni sorun" ve "saatte 10'dan fazla olay" kuralı →
  e-posta. Zamanlanmış iş hataları `job` etiketiyle gelir.
- **Gecikmiş iş:** panoda "Gecikti/Takıldı/Başarısız" → Vercel → Logs (cron) ya da Railway →
  iş servisi → Logs. Bildirim işi elle: `curl -H "Authorization: Bearer $CRON_SECRET"
https://<alan-adı>/api/cron/notifications`.
- **Haftalık:** onay kuyruğu boşaltılır; veri hattı hata sayıları ve ayıklama doğruluğu
  (`pnpm engine:eval`) gözden geçirilir.
