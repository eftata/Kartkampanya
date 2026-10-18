import { z } from "zod";

import { looksLikeCardNumber } from "./cards";

/** Kapalı beta geri bildirimi (ADR 0024). */
export const FeedbackKind = z.enum(["BUG", "IDEA", "DATA", "OTHER"]);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

export const FeedbackStatus = z.enum(["NEW", "READ", "DONE"]);
export type FeedbackStatus = z.infer<typeof FeedbackStatus>;

export const FEEDBACK_MAX_LENGTH = 2000;

export const FeedbackInput = z
  .object({
    kind: FeedbackKind,
    rating: z.number().int().min(1).max(5).nullable().default(null),
    message: z
      .string()
      .trim()
      .min(5, "Biraz daha ayrıntı yaz (en az 5 karakter).")
      .max(FEEDBACK_MAX_LENGTH, `En fazla ${FEEDBACK_MAX_LENGTH} karakter yazabilirsin.`)
      .refine((value) => !looksLikeCardNumber(value), {
        message:
          'Mesajına kart numarası yazma; kartı adıyla (ör. "Bonus Platinum") belirtmen yeter.',
      }),
    /** Gönderildiği sayfanın yolu ("/plan"); sorgu dizgisi ve parça atılır. */
    page: z
      .string()
      .max(200)
      .regex(/^\/[^\s]*$/, "Geçersiz sayfa.")
      .transform((value) => value.split(/[?#]/)[0] ?? value)
      .nullable()
      .default(null),
    /** "Bu kampanyada hata var": ilgili kampanya (yalnızca onaylı ya da süresi dolmuş). */
    campaignId: z.string().min(1).max(100).nullable().default(null),
  })
  .strict();
export type FeedbackInput = z.infer<typeof FeedbackInput>;
export type FeedbackInputRaw = z.input<typeof FeedbackInput>;

export const FeedbackStatusInput = z.object({ status: FeedbackStatus }).strict();

export const FeedbackDto = z.object({
  id: z.string(),
  kind: FeedbackKind,
  rating: z.number().int().nullable(),
  message: z.string(),
  page: z.string().nullable(),
  campaign: z.object({ id: z.string(), title: z.string() }).nullable(),
  status: FeedbackStatus,
  createdAt: z.iso.datetime(),
});
export type FeedbackDto = z.infer<typeof FeedbackDto>;
