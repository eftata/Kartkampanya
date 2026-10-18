# 0029 — Ay sonu raporu: kazanılan / kaçırılan

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-18

## Bağlam

Faz 2: kullanıcı ay bitince ne kazandığını ve neyi kaçırdığını görmeli. Veri kaynağı, girilen ya
da ekstreden aktarılan harcamalar (ADR 0027, 0028). Kampanyalar ay sınırına uymaz; bir kampanyanın
sonucu ancak bitince kesinleşir.

## Karar

- **Hesap** saf `lib/month-report.ts → computeMonthReport`:
  - Kampanya sonucu **bitiş tarihinin ayına** yazılır (iki aya yayılan kampanya iki kez sayılmaz);
    ödül tüm kampanya penceresindeki harcamalardan (`ruleProgress`) hesaplanır. Çok kurallı
    kampanyada en yüksek kazanç sayılır; taksit ödülleri hariç.
  - **Kazanılan:** ödül > 0 ve (katılım gerekmez ya da katıldın). **Kaçırılan:** ödül > 0 ama
    katılım gerekli ve katılmadın (`not_joined`), ya da kapsamda harcama var ama eşiğe ulaşılmadı
    (`threshold`; eşiğe en yakın kuralın eksiği ve o kademenin tahmini ödülü). Kapsamda hiç harcama
    yoksa kampanya listelenmez (gereksiz harcamaya teşvik yok).
  - **Kart temel kazancı:** ayın harcamalarına kartın kategori (yoksa genel) oranı.
  - Ay bitmediyse rapor "şimdiye kadar": bitmemiş kampanyalar `ongoing` sayılır, sonuçları ay
    sonunda.
- **Sayfa** `/plan/rapor?ay=YYYY-AA` (varsayılan geçen ay; harcama/plan olan son 12 ay seçici),
  API `GET /api/me/report?month=` (`MonthReportDto`, gelecek ay 400).
- **Gerçekleşen:** kapanan ay raporu açıldığında `MonthlyPlan.realizedKurus` = kampanya + temel
  kazanç (plan/gerçek kıyası için).
- **E-posta:** günlük bildirim işi ayın 1'inde (Türkiye günü) geçen ayın raporunu gönderir
  (`MONTHLY_REPORT`, anahtar = ay, bir kez); yalnızca o ay harcama girildiyse. Tercih
  `monthlyReport` (varsayılan açık, Profilim ve tek tıkla çıkış). Elle: `?monthly=1`.

## Sonuçlar

- Rapor yalnızca girilen harcamalar kadar doğru; bankanın ekstresi esastır (sayfada ve e-postada
  belirtildi). Harcama girmeyen kullanıcıya e-posta gitmez.
- "Yanlış kartla ödedin" türü kaçırılanlar (başka kartın kampanyası daha iyiydi) henüz yok; plan
  ile gerçekleşen kart dağılımının karşılaştırılması ayrı bir iş.
- Aydınlatma metnindeki bildirim listesine ay sonu raporu eklendi (sürüm `2026-10-18.6`).
