# 0016 — "Bu ayın planı": kullanıcı verisinden plan isteği

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17

## Bağlam

Motor (ADR 0015) durumsuzdur; web kullanıcının kartlarını, harcama profilini ve kampanyalarını
`PlanRequest`'e çevirip `POST /optimize` çağırır. Veritabanındaki kampanya kuralları ile motorun
sözleşmesi birebir aynı değildir: kampanya ayın bir kısmında geçerli olabilir, bir kampanyanın
birden çok kuralı alternatif kademe olabilir, bazı kurallar markaya özgüdür.

## Karar

- **Dönüşüm saf modülde** (`lib/plan-request.ts → buildPlanRequest`, birim testli); veri okuma ve
  motor çağrısı `lib/plan.ts → getMonthlyPlan`, motor istemcisi `lib/engine.ts`.
- **Ay:** Türkiye takvimine göre bu ay. Bütçe = harcama profili (ana kategoriye göre). Plan, ayın
  hangi gününde açılırsa açılsın bütün ayı planlar.
- **Kartlar:** `UserCard.id`; limit `limitKurus`; oranlar `{"*": baseRateBps}` + kategoriye özel
  oranlar ana kategoriye indirgenir. En fazla 3 kart (kullanıcının kart sayısını aşmadan).
- **Kampanyalar:** onaylı, bu ayla kesişen, bitmemiş; kart kapsamına uyan kullanıcı kartları.
  - Her kural bir `PlanCampaign`; çok kurallı kampanyanın kuralları **aynı grupta**
    (`group` = kampanya id'si): motor gruptan yalnızca en yüksek ödüllü kuralı sayar. Sözleşmeye bu
    yüzden `group` alanı eklendi (ADR 0015).
  - **Ay penceresi:** kampanya ayın yalnızca `p` gününde geçerliyse (ayın `D` günü), aylık harcamanın
    o pencereye düşen payı `p/D` kabul edilir: eşik `× D/p` büyütülür, oransal ödül `× p/D`
    küçültülür. Sabit ödül ve üst limit değişmez.
  - Marka kuralı yalnızca kullanıcı o markayı profilinde seçtiyse kategorisine bağlanır (o
    kategorideki harcamanın tamamının o markada yapıldığı varsayılır). Profil dışı alana dokunan
    kural atlanır (boş kategori listesi "tüm harcamalar" demek olurdu).
  - Taksit ödülleri (para değeri yok) plana girmez. Katılım süresi geçmiş ve katılınmamış kampanya
    `eligible: false`.
- **Motor çağrısı:** `ENGINE_URL` + `ENGINE_TOKEN`, 10 sn zaman aşımı, yanıt zod ile doğrulanır;
  hata ayrıntısı günlüğe, kullanıcıya genel mesaj. Çağrıdan önce `connection()`: Next'in
  ön-render'ı (bağlantı ön yüklemesi) motoru çağırmaz.
- **Sayfa (`/plan`):** beklenen kazanç, "her şeyi tek kartla ödeseydin" ve fark; kategori-kart
  tablosu (kampanyalar detay sayfasına bağlı); planın dayandığı ama katılınmamış kampanyalar için
  "Katıldım"; limit yetmezse uyarı; "Az kaldı" (gereksiz harcamaya teşvik etmeyiz notuyla);
  oranlar doğrulanmadıysa ve çözüm kanıtlanmış en iyi değilse not.
- **e2e:** Playwright motoru ikinci sunucu olarak başlatır (`uv run uvicorn`, port 8100, test
  anahtarı); CI e2e işi uv ile motor bağımlılıklarını kurar.

## Sonuçlar

- Plan her açılışta yeniden hesaplanır; saklama (`MonthlyPlan`) ve `inPlan` işaretleri sonraki
  görevdir.
- Varsayımlar (marka payı, ay penceresi) kaba olabilir; Faz 2'de gerçek işlem verisiyle
  iyileştirilir.
