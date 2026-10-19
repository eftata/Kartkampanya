# KartPlan Lite — yalnızca Firebase

Ana projenin (Next.js + Postgres + Python motoru) sade sürümü. Sunucu yok: **Firebase Hosting**
statik sayfayı sunar, **Firebase Auth** girişi, **Cloud Firestore** veriyi tutar. Plan hesabı
tarayıcıda yapılır. Ücretsiz (Spark) planda çalışır; Cloud Functions gerekmez.

## Ne yapar?

| Sayfa          | İşlev                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/baslangic`   | 2 adımlı kurulum: kartları seç (+ aydınlatma onayı) → aylık harcama profili                                              |
| `/plan`        | Bu ayın planı: kategori başına kart + tutar + kampanya, beklenen kazanç, tek kart kıyası, “katılmayı unutma”, “az kaldı” |
| `/kampanyalar` | Sana uyan / tüm kampanyalar; kart, kategori, fayda filtresi; bitişe/kazanca göre sıralama; “Katıldım”                    |
| `/hesapla`     | Tek alışveriş: tutar + kategori + tarih → kartlar kazanca göre sıralı                                                    |
| `/kartlarim`   | Cüzdan: kart ekle/çıkar                                                                                                  |
| `/harcama`     | Harcama profilini düzenle                                                                                                |
| `/profil`      | Çıkış, verilerimi indir (JSON), hesabımı sil                                                                             |
| `/admin`       | Kampanya ekle/düzenle (taslak/yayında), kart kataloğu ve temel oranlar, örnek veri                                       |

Kurallar ana projeyle aynı: para kuruş cinsinden tamsayı, oran baz puan; kart numarası hiçbir
formda alınmaz; katalog oranları doğrulanana kadar 0.

## Yapı

```
src/
  lib/optimizer.ts   plan (açgözlü, durumsuz) — testli
  lib/advisor.ts     tek alışveriş önerisi — testli
  lib/money.ts       kuruş/bps biçimleme ve ayrıştırma — testli
  lib/data.ts        tüm Firestore okuma/yazma
  lib/store.tsx      oturum + canlı veri (onSnapshot)
  lib/seed.ts        başlangıç kataloğu + "Örnek" kampanyalar
  pages/, components/
firestore.rules      güvenlik kuralları (kullanıcı yalnızca kendi belgesini görür)
```

Firestore koleksiyonları: `cards` (katalog), `campaigns`, `users/{uid}`, `admins/{uid}`.

## Kurulum

```bash
npm install
npm install -g firebase-tools   # bir kez
firebase login
```

1. [Firebase konsolunda](https://console.firebase.google.com) proje oluştur.
2. **Authentication → Sign-in method:** Google ve E-posta/Şifre'yi aç.
3. **Firestore Database** oluştur (production mode).
4. `cp .firebaserc.example .firebaserc` ve proje kimliğini yaz.
5. Yerelde geliştirme için: `cp .env.example .env` ve Proje ayarları → Web uygulaması bilgilerini gir.

```bash
npm run dev          # http://localhost:5173
npm test             # Vitest
npm run deploy       # build + kurallar + hosting
```

Deploy edilen sürüm Firebase yapılandırmasını `/__/firebase/init.json`'dan kendisi alır; `.env`
gerekmez.

### Emülatörle (bulut projesi olmadan)

```bash
firebase emulators:start --only auth,firestore --project demo-kartplan
# başka terminalde, .env içinde:
#   VITE_FIREBASE_API_KEY=demo-key
#   VITE_FIREBASE_PROJECT_ID=demo-kartplan
#   VITE_USE_EMULATORS=1
npm run dev
```

### İlk admin

Giriş yaptıktan sonra Firebase konsolu → Authentication'dan kullanıcının **UID**'sini kopyala,
Firestore'da `admins/<UID>` belgesini (boş ya da `{ note: "ben" }`) oluştur. Sayfayı yenile;
menüde **Yönetim** çıkar. Oradan:

1. **Kart kataloğu → Kataloğu yükle** (5 program, 18 kart; yalnızca eksikleri ekler).
2. Oranları bankanın kaynağından doğruladıkça gir ve “doğrulandı” işaretle.
3. **Kampanyalar → Yeni kampanya** ya da denemek için **Örnek kampanyaları ekle** (gerçek değil,
   “Örnek” etiketli; işin bitince sil).

## Tasarım

- Renk: coolors trend paletlerinden “olive garden” — `#fefae0` `#283618` `#606c38` `#dda15e`
  `#bc6c25`; koyu tema aynı paletten türetilir (`src/styles.css` başındaki değişkenler).
- Yazı: **Fraunces** (başlık ve rakamlar), **IBM Plex Sans** (metin), **IBM Plex Mono** (etiketler) —
  paketle gelir, Google Fonts'a istek atmaz.

## Bilinçli olarak dışarıda

Banka sitelerinden otomatik kampanya toplama, LLM ayıklama, e-posta/push bildirimleri, harcama
takibi ve ekstre içe aktarma. Bunlar sunucu (Cloud Functions, Blaze plan) ister; ihtiyaç olursa
`lib/optimizer.ts` ve veri modeli değişmeden eklenebilir.
