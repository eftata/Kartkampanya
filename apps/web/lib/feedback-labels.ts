import type { FeedbackKind, FeedbackStatus } from "@kartplan/shared";

/** Geri bildirim türlerinin ve durumlarının Türkçe adları (kullanıcı ve admin arayüzü). */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  BUG: "Bir şey çalışmıyor",
  IDEA: "Öneri",
  DATA: "Kampanya ya da kart bilgisi yanlış",
  OTHER: "Diğer",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: "Yeni",
  READ: "Okundu",
  DONE: "Tamamlandı",
};

/** Kullanıcıya gösterilen durum: "okundu" ve "tamamlandı" ekibin ilgilendiğini anlatır. */
export const FEEDBACK_STATUS_FOR_USER: Record<FeedbackStatus, string> = {
  NEW: "Gönderildi",
  READ: "Ekip okudu",
  DONE: "Çözüldü / değerlendirildi",
};
