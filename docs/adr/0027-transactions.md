# 0027 — Harcama girişi, eşik ilerlemesi ve kalan bütçeyle planlama (Faz 2)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Faz 2'nin ilk maddesi: kullanıcı harcamalarını girer, kampanya eşiklerine ne kadar kaldığını
görür ve plan ayın kalanı için güncellenir. Açık bankacılık ve ekstre içe aktarma yok; giriş elle.
Kart numarası ya da ekstre bilgisi alınmaz. (ROADMAP Faz 2'yi Kapı 1 kararına bağlıyor; kullanıcı
isteğiyle beta ölçümü beklenmeden başlandı.)

## Karar

- **Model** `Transaction`: kullanıcı, `UserCard`, ana kategori, isteğe bağlı marka (o kategoriden),
  `amountKurus` (≤ 1 milyon TL), `date` (Türkiye günü; ileri tarih yok, en fazla 90 gün geri),
  `source` (`MANUAL`; `STATEMENT` ekstre içe aktarma için ayrıldı). Kart kaldırılınca (onay
  penceresiyle) ve hesapla birlikte silinir; veri kopyasında yer alır; aydınlatma metnine eklendi
  (sürüm `2026-10-18.4`).
- **İlerleme** saf `lib/campaign-progress.ts`, saklanmaz (her plan hesabında harcamalardan):
  - Eşleşme: kampanya tarihleri içinde, kampanyanın programı/kart kapsamındaki kartla; markalı
    kuralda marka, kategorili kuralda ana kategori eşleşmeli (alt kategori kurallarında yaklaşık);
    kapsamsız kural her harcamayı sayar.
  - Toplam harcama: kademe = ⌊toplam/eşik⌋ (tekrarsızda 0/1); tek seferde: eşiği geçen her
    alışveriş bir kademe; işlem adedi: ⌊adet/N⌋. Ödül = kademe × sabit ödül + eşik geçildiyse
    oransal ödül; üst limitle sınırlı. "Tamamlandı" = tekrarsız kural kazanıldı ya da üst limit doldu.
- **Kalan bütçe modu** (`buildPlanRequest` `spent` girdisi; bu ay en az bir harcama varsa):
  bütçe kategori başına profilden bu ay harcananı düşer; kart limiti bu ay o kartla harcananı düşer;
  ay ve kampanya penceresi bugünden başlar (eşik ölçeklemesi kalan günlere göre); tamamlanan kural
  plana girmez; tekrarsız kuralın eşiği kalan tutara/adede iner; tekrarlanan kuralda eşik aynı kalır
  (kısmi kademe temkinli olarak yok sayılır); üst limitten kazanılan düşer. Harcamalar plan özetini
  değiştirdiği için yeni harcama planı kendiliğinden yeniden hesaplatır. Ödülü kazanılmış kampanya
  "plana dahil" kalır.
- **Arayüz:** `/harcamalar` (form, kategori başına plan/harcanan, bu ayın listesi ve silme), plan
  sayfasında "Kampanya ilerlemen" (plandaki, katılınan ya da harcama sayılan kampanyalar).
  API `GET/POST /api/me/transactions`, `DELETE /api/me/transactions/{id}`.

## Sonuçlar

- İlerleme yalnızca girilen harcamalardan; bankanın kayıtları esastır (arayüzde belirtildi). Hesap
  kesim günü ve iadeler hesaba katılmaz; kart limiti takvim ayına göre düşülür.
- Alt kategorili kurallarda ana kategori eşleşmesi fazla sayabilir (ör. "online market" kuralına
  mağazadaki market harcaması). Gerekirse harcama girişine alt kategori eklenir.
- `UserCampaignStatus.progressKurus` kullanılmıyor; ilerleme türetilmiş veri olarak hesaplanıyor.
