import { z } from "zod";

import { Kurus } from "./money";

/**
 * Kart numarası (PAN) gibi görünen 13–19 haneli sayı dizilerini yakalar; araya boşluk, tire veya
 * nokta konmuş olsa bile. KVKK kuralı: kart numarası hiçbir alanda kabul edilmez.
 */
export function looksLikeCardNumber(value: string): boolean {
  const digitRuns = value.match(/\d(?:[\s.-]*\d)*/g) ?? [];
  return digitRuns.some((run) => run.replace(/\D/g, "").length >= 13);
}

const NoCardNumber = (schema: z.ZodString) =>
  schema.refine((value) => !looksLikeCardNumber(value), {
    message: "Kart numarası girmeyin; yalnızca kartı tanıyacağınız bir ad yazın.",
  });

/** Kullanıcı başına en fazla kart sayısı (kötüye kullanım sınırı). */
export const MAX_USER_CARDS = 20;
/** Kart limiti üst sınırı: 10.000.000 TL (kuruş). */
export const MAX_LIMIT_KURUS = 1_000_000_000;

export const AddUserCardInput = z.object({
  cardProductId: z.string().min(1, "Bir kart seçin."),
  nickname: NoCardNumber(z.string().trim().max(40, "Ad en fazla 40 karakter olabilir."))
    .transform((value) => value || undefined)
    .optional(),
  limitKurus: Kurus.min(1, "Limit sıfırdan büyük olmalı.")
    .max(MAX_LIMIT_KURUS, "Limit çok yüksek görünüyor.")
    .optional(),
  statementDay: z
    .number()
    .int()
    .min(1, "Kesim günü 1–31 arasında olmalı.")
    .max(31, "Kesim günü 1–31 arasında olmalı.")
    .optional(),
});
export type AddUserCardInput = z.infer<typeof AddUserCardInput>;

export const CardType = z.enum(["CREDIT", "DEBIT", "VIRTUAL"]);

export const UserCardDto = z.object({
  id: z.string(),
  cardProductId: z.string(),
  cardName: z.string(),
  programName: z.string(),
  bankName: z.string(),
  nickname: z.string().nullable(),
  limitKurus: Kurus.nullable(),
  statementDay: z.number().int().nullable(),
});
export type UserCardDto = z.infer<typeof UserCardDto>;

export const CatalogCard = z.object({ id: z.string(), name: z.string(), type: CardType });
export const CatalogProgram = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  pointName: z.string(),
  cards: z.array(CatalogCard),
});
export const CatalogBank = z.object({
  id: z.string(),
  name: z.string(),
  programs: z.array(CatalogProgram),
});
export type CatalogBank = z.infer<typeof CatalogBank>;
export const CatalogBanksResponse = z.object({ banks: z.array(CatalogBank) });
export type CatalogBanksResponse = z.infer<typeof CatalogBanksResponse>;
