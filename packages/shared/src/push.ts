import { z } from "zod";

/** Web push aboneliği (Faz 2; ADR 0031): tarayıcının `PushSubscription.toJSON()` çıktısı. */

const Base64Url = (max: number) =>
  z
    .string()
    .min(16)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Geçersiz anahtar.");

export const PushSubscriptionInput = z.object({
  endpoint: z
    .string()
    .max(2048)
    .url("Geçersiz bildirim adresi.")
    .refine((value) => /^https?:\/\//.test(value), "Geçersiz bildirim adresi."),
  /** Tarayıcı gönderir; kullanılmaz. */
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    /** P-256 açık anahtarı (65 bayt → 87 karakter). */
    p256dh: Base64Url(128),
    /** 16 baytlık kimlik doğrulama sırrı (22 karakter). */
    auth: Base64Url(64),
  }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const PushUnsubscribeInput = z.object({ endpoint: z.string().max(2048) }).strict();
export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeInput>;

/** `GET /api/me/push`: sunucu yapılandırması ve kayıtlı cihaz sayısı. */
export const PushStatusDto = z.object({
  /** Sunucuda VAPID anahtarları tanımlı mı (değilse push kapalı). */
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
  devices: z.number().int(),
});
export type PushStatusDto = z.infer<typeof PushStatusDto>;

/** Servis çalışanının gösterdiği bildirim (şifreli yük). */
export const PushPayload = z.object({
  title: z.string(),
  body: z.string(),
  /** Tıklanınca açılacak uygulama içi yol ("/kampanyalarim"). */
  url: z.string().startsWith("/"),
  /** Aynı etiketli eski bildirimin yerine geçer. */
  tag: z.string().optional(),
});
export type PushPayload = z.infer<typeof PushPayload>;
