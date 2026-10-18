import { z } from "zod";

import { DateOnly } from "./campaigns";
import { Kurus } from "./money";
import { TRANSACTION_MAX_KURUS } from "./transactions";

/** Ekstre PDF'inden harcama içe aktarma (Faz 2; ADR 0028). */

export const STATEMENT_MAX_BYTES = 4 * 1024 * 1024;
export const STATEMENT_MAX_ROWS = 300;

/** Motorun `POST /statements/parse` yanıtı. */
export const StatementParseResult = z.object({
  parser: z.string(),
  pages: z.number().int(),
  rows: z
    .array(
      z.object({
        date: DateOnly,
        description: z.string().max(120),
        amountKurus: Kurus.min(1),
        installment: z.string().nullable(),
      }),
    )
    .max(2000),
  skippedCredits: z.number().int(),
  unparsedLines: z.number().int(),
});
export type StatementParseResult = z.infer<typeof StatementParseResult>;

export const StatementErrorCode = z.enum([
  "invalid",
  "too_large",
  "too_many_pages",
  "password_required",
  "wrong_password",
]);
export type StatementErrorCode = z.infer<typeof StatementErrorCode>;

/** Kullanıcıya onaylatılan satır: öneriler ve uyarılarla. Açıklama yalnızca ekranda gösterilir. */
export const StatementReviewRow = z.object({
  date: DateOnly,
  description: z.string(),
  amountKurus: Kurus,
  installment: z.string().nullable(),
  /** Açıklamadan tanınan marka ve onun ana kategorisi. */
  merchantId: z.string().nullable(),
  categoryId: z.string().nullable(),
  /** Aynı kart, gün ve tutarla zaten kayıtlı harcama var. */
  duplicate: z.boolean(),
  /** Girilebilecek tarih aralığının dışında (90 günden eski ya da ileri tarihli). */
  outOfRange: z.boolean(),
});
export type StatementReviewRow = z.infer<typeof StatementReviewRow>;

export const StatementReview = z.object({
  parser: z.string(),
  rows: z.array(StatementReviewRow),
  skippedCredits: z.number().int(),
  unparsedLines: z.number().int(),
});
export type StatementReview = z.infer<typeof StatementReview>;

/** `POST /api/me/statements/import`: kullanıcının onayladığı satırlar (açıklama gönderilmez). */
export const StatementImportInput = z
  .object({
    userCardId: z.string().min(1).max(100),
    rows: z
      .array(
        z
          .object({
            date: DateOnly,
            amountKurus: Kurus.min(1).max(TRANSACTION_MAX_KURUS),
            categoryId: z.string().min(1).max(100),
            merchantId: z.string().min(1).max(100).nullable(),
          })
          .strict(),
      )
      .min(1, "En az bir satır seç.")
      .max(STATEMENT_MAX_ROWS, `Tek seferde en fazla ${STATEMENT_MAX_ROWS} satır eklenebilir.`),
  })
  .strict();
export type StatementImportInput = z.infer<typeof StatementImportInput>;
