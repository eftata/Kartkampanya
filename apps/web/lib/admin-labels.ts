export const CARD_TYPE_LABELS = {
  CREDIT: "Kredi kartı",
  DEBIT: "Banka kartı",
  VIRTUAL: "Sanal kart",
} as const;

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  EXPIRED: "Süresi doldu",
} as const;

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
