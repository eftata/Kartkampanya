/**
 * KVKK metinleri ve sürümleri (ADR 0019). Metin değişince sürüm artırılır: kullanıcılardan
 * bir sonraki girişte yeniden onay istenir (eski onaylar `Consent` geçmişinde kalır). Sürüm
 * değişiklik günüdür; aynı gün ikinci değişiklik `.2`, `.3` eki alır.
 *
 * TASLAK: hukuki inceleme yapılmadı. Köşeli parantezli alanlar (veri sorumlusu, adres, iletişim)
 * yayın öncesi doldurulmalı; metinler avukat kontrolünden geçmeli (ROADMAP → KVKK listesi).
 */

export const CONSENT_KINDS = {
  /** Aydınlatma metnini okuduğunu beyan (bilgilendirme; rıza değil). */
  aydinlatma: "kvkk_aydinlatma",
  /** Kişisel verilerin yurt dışındaki hizmet sağlayıcılara aktarımına açık rıza. */
  acikRiza: "acik_riza_yurtdisi",
  /** Pazarlama/kampanya duyurusu iletisi izni (isteğe bağlı, ayrı). */
  pazarlama: "pazarlama",
} as const;

export const LEGAL_VERSIONS = {
  aydinlatma: "2026-10-18.5",
  acikRiza: "2026-10-18",
  pazarlama: "2026-10-17",
} as const;

export const LEGAL_DRAFT_NOTICE =
  "Bu metin taslaktır; hukuki incelemeden geçtikten sonra yayınlanacaktır.";

const CONTROLLER = "[Veri sorumlusu unvanı], [adres], [MERSİS no]";
const CONTACT = "[kvkk@alan-adı]";

export type LegalSection = { title: string; paragraphs: string[] };

export const AYDINLATMA_METNI: LegalSection[] = [
  {
    title: "Veri sorumlusu",
    paragraphs: [
      `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu ${CONTROLLER}'dir ("KartPlan").`,
    ],
  },
  {
    title: "İşlenen kişisel veriler",
    paragraphs: [
      "Kimlik ve iletişim: e-posta adresi; Google ile girişte ad ve profil fotoğrafı.",
      "Hizmet verileri: seçtiğin kart ürünleri (banka, program, kart adı), isteğe bağlı kart limiti ve hesap kesim günü, kartlara verdiğin takma adlar, kategori başına aylık harcama tutarları ve tercih ettiğin markalar, kampanyalara katıldığına dair işaretlerin, hesaplanan aylık planların, bildirim tercihlerin, gönderilen bildirimlerin kaydı ve bize gönderdiğin geri bildirim mesajları.",
      "Harcama kayıtları: kendi girdiğin harcamalar (kart, kategori, isteğe bağlı marka, tutar, tarih); kampanya ilerlemeni ve ayın kalanı için planını hesaplamakta kullanılır, sen silene ya da hesabını kapatana kadar saklanır.",
      "Ekstre yükleme: kredi kartı ekstreni (PDF) yüklersen dosya yalnızca harcama satırlarını çıkarmak için bellekte işlenir; dosya, içindeki ad, adres, kart numarası ve açıklamalar ile PDF parolası saklanmaz. Yalnızca onayladığın satırların tarihi, tutarı ve kategorisi harcama kaydı olur.",
      "Kullanım günleri: uygulamayı hangi günlerde kullandığın (saat, sayfa ya da işlem değil), ilk kart ekleme ve planı ilk görme zamanı; 180 gün saklanır.",
      "İşlem güvenliği: oturum kayıtları, sunucu günlükleri ve hata kayıtları (e-posta, ad ve çerez içermez).",
      "Kullanım istatistikleri: ziyaret edilen sayfalar (adres parametreleri olmadan) ve hesabına bağlı ürün adımları (kayıt, kart ekleme, harcama profili, plan görüntüleme, kampanyaya katılım). Bu adımlar e-postan ya da adınla değil, yalnızca bizim çözebileceğimiz takma bir kimlikle kaydedilir; tarayıcına analitik çerezi yazılmaz.",
      "Kart numarası, CVV, son kullanma tarihi, şifre ya da banka hesap bilgisi hiçbir koşulda alınmaz ve saklanmaz.",
    ],
  },
  {
    title: "İşleme amaçları ve hukuki sebepler",
    paragraphs: [
      "Hesabının oluşturulması, girişin sağlanması, geri bildirimlerinin değerlendirilip sana dönülmesi, kartlarına ve harcama alanlarına uyan kampanyaların listelenmesi, aylık harcama planının hesaplanması ve hizmet bildirimlerinin (katılım hatırlatma, kampanya bitiş uyarısı, haftalık özet) gönderilmesi: sözleşmenin kurulması ve ifası (KVKK m. 5/2-c).",
      "Hizmetin güvenliği, kötüye kullanımın önlenmesi (istek sınırlama) ve hataların giderilmesi: meşru menfaat (KVKK m. 5/2-f) ve hukuki yükümlülük (m. 5/2-ç).",
      "Hizmetin hangi adımlarının kullanıldığını ve kullanıcıların geri dönüp dönmediğini ölçüp geliştirmek (kullanım istatistikleri, kullanım günleri): meşru menfaat (KVKK m. 5/2-f).",
      "Pazarlama iletileri: yalnızca ayrıca izin verirsen (açık rıza, m. 5/1); izin vermemen hizmeti kullanmana engel değildir.",
    ],
  },
  {
    title: "Aktarım",
    paragraphs: [
      "Verilerin, hizmetin çalışması için barındırma (web uygulaması ve veritabanı), e-posta gönderimi, hata takibi (Sentry) ve kullanım istatistikleri (PostHog, Avrupa Birliği sunucuları) hizmeti aldığımız sağlayıcılarla paylaşılır. Bu sağlayıcıların bir kısmının sunucuları yurt dışındadır; bu aktarım için açık rızan istenir (KVKK m. 9).",
      "Bankalara ya da reklam ağlarına kişisel veri aktarılmaz. Ürün analitiği araçlarına e-posta ya da ad gönderilmez.",
      "Kampanya metinlerini işlemek için kullanılan yapay zekâ hizmetine yalnızca bankaların herkese açık kampanya metinleri gönderilir; senin verilerin gönderilmez.",
    ],
  },
  {
    title: "Saklama süresi",
    paragraphs: [
      "Verilerin hesabın açık olduğu sürece saklanır. Hesabını sildiğinde hesabın hemen kapatılır, verilerin 30 gün içinde kalıcı olarak silinir. Mevzuatın saklamamızı zorunlu kıldığı kayıtlar bu sürelerle sınırlı tutulur.",
    ],
  },
  {
    title: "Hakların (KVKK m. 11)",
    paragraphs: [
      "Verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik ya da yanlışsa düzeltilmesini, silinmesini ya da yok edilmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsin.",
      `Verilerinin bir kopyasını Profilim sayfasından indirebilir, hesabını aynı sayfadan silebilirsin. Diğer başvurular için: ${CONTACT}.`,
    ],
  },
];

export const ACIK_RIZA_METNI =
  "Kişisel verilerimin, KartPlan'ın hizmetin sunulması için çalıştığı ve sunucuları yurt dışında bulunan barındırma, e-posta, hata takibi ve kullanım istatistiği sağlayıcılarına aktarılmasına, Aydınlatma Metni'nde açıklanan kapsamda açık rıza veriyorum.";

export const PAZARLAMA_METNI =
  "KartPlan'ın yeni özellikler ve kampanyalarla ilgili duyurularını e-posta ile almak istiyorum. (İsteğe bağlı; istediğin zaman Profilim'den kapatabilirsin.)";
