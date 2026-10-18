import { z } from "zod";

import { DateOnly } from "./campaigns";
import { Kurus } from "./money";

/** Elle harcama girişi (Faz 2; ADR 0027). */

/** Tek harcama en fazla 1 milyon TL (üstü yazım hatası). */
export const TRANSACTION_MAX_KURUS = 100_000_000;
/** Bu kadar günden eski harcama girilemez (kampanya takibi için anlamsız). */
export const TRANSACTION_MAX_AGE_DAYS = 90;

const Id = z.string().min(1).max(100);

export const TransactionInput = z
  .object({
    userCardId: Id,
    /** Ana kategori (`Category.id`). */
    categoryId: Id,
    merchantId: Id.nullable().default(null),
    amountKurus: Kurus.min(1, "Tutar 0'dan büyük olmalı.").max(
      TRANSACTION_MAX_KURUS,
      "Tutar çok büyük; yazım hatası olabilir.",
    ),
    /** Harcama günü (Türkiye takvimi); bugünden ileri ve 90 günden eski olamaz (sunucuda). */
    date: DateOnly,
  })
  .strict();
export type TransactionInput = z.infer<typeof TransactionInput>;
export type TransactionInputRaw = z.input<typeof TransactionInput>;

export const TransactionDto = z.object({
  id: z.string(),
  userCardId: z.string(),
  cardName: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  merchantId: z.string().nullable(),
  merchantName: z.string().nullable(),
  amountKurus: Kurus,
  date: DateOnly,
});
export type TransactionDto = z.infer<typeof TransactionDto>;

/** `GET /api/me/transactions?month=YYYY-AA` */
export const TransactionsQuery = z
  .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Ay YYYY-AA biçiminde olmalı.") })
  .partial()
  .strict();
