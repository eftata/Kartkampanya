/** Kampanya alanlarının Türkçe adları (kullanıcı ve admin arayüzü ortak). */

export const JOIN_METHOD_LABELS = {
  AUTO: "Otomatik (katılım gerekmez)",
  SMS: "SMS ile",
  APP: "Mobil uygulamadan",
  WEB: "Web sitesinden",
} as const;

export const THRESHOLD_LABELS = {
  SINGLE: "Tek seferde harcama",
  CUMULATIVE: "Toplam harcama",
  TXN_COUNT: "İşlem adedi",
} as const;

export const REWARD_LABELS = {
  POINTS: "Puan",
  CASHBACK: "İade",
  DISCOUNT: "İndirim",
  INSTALLMENT: "Ek taksit",
} as const;
