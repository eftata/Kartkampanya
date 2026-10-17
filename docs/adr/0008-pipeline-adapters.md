# 0008 — Veri hattı adaptörleri ve kibar istemci

- **Durum:** Kabul edildi (World ve Bonus adaptörleri bekliyor)
- **Tarih:** 2026-10-17

## Bağlam

Her banka için bir adaptör kampanya listesinden detay sayfalarına gider ve ham şart metnini çıkarır.
ROADMAP taslağındaki arayüz `list_urls(page)` / `fetch(page, url)` biçimindeydi (tarayıcı sayfası).
Tarama kuralları: istekler arası ≥ 2 sn, günde bir tarama, net User-Agent, robots.txt'e uyum.

## Karar

- **Ayrıştırma ile ağ ayrı:** adaptör yalnızca `parse_list(html, base_url)` ve
  `parse_detail(html, url)` yazar; `list_urls` / `fetch` taban sınıfta ve bir `Fetcher` alır. Böylece
  adaptörler kayıtlı HTML ile ağsız test edilir; JavaScript ile çizilen bir site çıkarsa aynı arayüze
  tarayıcı tabanlı bir `Fetcher` takılır, adaptör değişmez.
- **`PoliteFetcher` (httpx2):** tek ağ kapısı. Aynı siteye istekler arası en az 2 sn (altı yapılandırma
  hatası); her site için robots.txt bir kez okunur — 404/410 tarama serbest, okunamazsa (5xx, 403, ağ
  hatası) **taranmaz**; her istekte `PIPELINE_USER_AGENT`; yalnızca HTML ve en fazla 5 MB kabul edilir.
- **Liste adresleri** mutlak, tekil, `#` parçasız ve liste sayfasıyla aynı sitedeyse alınır.
- **Metin/tarih yardımcıları:** `html_to_text` (script/style atılır, bloklar satırlara düşer),
  Türkçe tarih biçimleri ("1 Kasım 2026", "01.11.2026", "1-30 Kasım 2026", "1 Kasım - 31 Aralık 2026";
  İ/ı farkı gözetilir, geçersiz tarihler atlanır).
- **Fixture kuralı:** her adaptör, sitenin gerçek sayfalarından kaydedilmiş HTML ile test edilir; site
  değişince test kırılır. Gerçek HTML görülmeden seçici yazılmaz. Taban sınıf testleri "SENTETİK"
  etiketli örnek HTML kullanır.

## Durum ve sonuçlar

- Geliştirme ortamının ağ politikası banka sitelerini engelliyor (proxy CONNECT 403). World ve Bonus
  adaptörleri, sitelere erişim açılınca ya da sayfa örnekleri (liste + birkaç detay) kaydedilip repoya
  konunca yazılacak.
- Üretimde `PIPELINE_USER_AGENT` iletişim adresi içermeli.
