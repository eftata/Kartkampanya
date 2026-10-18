# 0030 — Tek alışveriş hesaplayıcısı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Faz 2: aylık plan bütçe dağıtır, ama kullanıcı çoğu zaman tek bir karar verir: "4.000 TL telefon
alacağım, hangi kartla?". Cevap kartın temel oranına, o tarihte geçerli kampanyalara ve kullanıcının
bu kampanyalardaki mevcut ilerlemesine (girilen/aktarılan harcamalar, ADR 0027-0028) bağlı.

## Karar

- **Hesap** saf `lib/purchase-advisor.ts → advisePurchase` (motor/optimizer kullanılmaz; tek
  alışverişte arama yok, her kart doğrudan değerlendirilir):
  - Kart başına **marjinal** kazanç = temel kazanç (kategori oranı, yoksa genel oran) + her
    kampanyada alışverişten sonraki ve önceki kazanç farkı (`ruleProgress`, çok kurallıda en
    yüksek kural). Eşiği zaten geçilmiş ya da üst limiti dolmuş kampanya kazanç göstermez.
  - Katılım gereken ama katılmadığın kampanya toplama girmez, "katılırsan +₺X" olarak ayrı
    listelenir (katılım süresi geçtiyse hiç gösterilmez). Taksit kampanyaları kazanç değil, not.
  - Kartın bu ay kalan limiti tutara yetmiyorsa `overLimit`; sıralama: limiti yetenler önce, sonra
    toplam kazanç, eşitse katılınca kazanç.
- **Veri** `lib/purchase-advice.ts → getPurchaseAdvice`: tarih bugün ile +90 gün arası, ana
  kategori, marka o kategoride olmalı; o gün geçerli onaylı kampanyalar ve kampanya pencerelerindeki
  harcamalar okunur. **Hiçbir şey kaydedilmez** (varsayımsal alışveriş).
- **Arayüz** `/hesapla` (menüde "Hangi kart?"): `next/form` GET, girdiler adreste (`tutar`,
  `kategori`, `marka`, `tarih`) — paylaşılabilir/yer imi; kart yoksa onboarding'e. API
  `POST /api/me/purchase-advice` (`PurchaseAdviceInput` → `PurchaseAdviceDto`).

## Sonuçlar

- Plan ve hesaplayıcı aynı ilerleme kurallarını (`ruleProgress`) kullanır; sayılar tutarlı.
- Kampanya metnindeki hariç tutmalar (ör. "taksitli işlemler") sayılmaz; kesin koşul bankada.
- Adres çubuğunda tutar ve kategori görünür (kişisel ama hassas değil). Sentry/PostHog adres
  temizliği (`SAFE_QUERY_PARAMS`) `tutar`, `marka`, `tarih`'i atar; yalnızca katalog kimliği olan
  `kategori` kalır.
