import { z } from "zod";

import { DateOnly } from "./campaigns";
import { Kurus } from "./money";
import { TRANSACTION_MAX_KURUS } from "./transactions";

/** Tek alışveriş hesaplayıcısı (Faz 2; ADR 0030): `POST /api/me/purchase-advice`. */

/** Bugünden en fazla bu kadar gün sonrası için hesaplanır. */
export const ADVICE_MAX_DAYS_AHEAD = 90;

export const PurchaseAdviceInput = z
  .object({
    amountKurus: Kurus.min(1, "Tutar 0'dan büyük olmalı.").max(
      TRANSACTION_MAX_KURUS,
      "Tutar çok büyük; yazım hatası olabilir.",
    ),
    /** Ana kategori. */
    categoryId: z.string().min(1).max(100),
    merchantId: z.string().min(1).max(100).nullable().default(null),
    /** Alışveriş günü; verilmezse bugün. */
    date: DateOnly.optional(),
  })
  .strict();
export type PurchaseAdviceInput = z.infer<typeof PurchaseAdviceInput>;

const Gain = z.object({ id: z.string(), title: z.string(), gainKurus: Kurus });

export const PurchaseAdviceDto = z.object({
  date: DateOnly,
  cards: z.array(
    z.object({
      cardId: z.string(),
      name: z.string(),
      totalKurus: Kurus,
      baseKurus: Kurus,
      campaigns: z.array(Gain),
      ifJoined: z.array(Gain.extend({ joinDeadline: DateOnly.nullable() })),
      installments: z.array(z.object({ id: z.string(), title: z.string() })),
      overLimit: z.boolean(),
    }),
  ),
  /** Kartlardan birinin oranları doğrulanmamış (temel kazanç tahmini belirsiz). */
  unverifiedRates: z.boolean(),
});
export type PurchaseAdviceDto = z.infer<typeof PurchaseAdviceDto>;
