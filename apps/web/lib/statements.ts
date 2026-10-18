import "server-only";

import { getPrisma } from "@kartplan/db";
import type {
  StatementErrorCode,
  StatementImportInput,
  StatementParseResult,
  StatementReview,
} from "@kartplan/shared";

import { track } from "@/lib/analytics";
import { turkeyToday } from "@/lib/campaign-match";
import type { MutationResult } from "@/lib/result";
import { suggestMerchant } from "@/lib/statement-match";
import { earliestTransactionDay } from "@/lib/transactions";

/**
 * Ekstreden harcama içe aktarma (ADR 0028): motorun çıkardığı satırlar kullanıcıya önerilerle
 * gösterilir (marka/kategori, mükerrer, tarih aralığı); yalnızca onaylananlar `Transaction`
 * (`source = STATEMENT`) olur. PDF, metin ve açıklamalar saklanmaz.
 */

export const STATEMENT_ERROR_MESSAGES: Record<StatementErrorCode | "unavailable", string> = {
  invalid: "Dosya okunamadı. Bankanın internet şubesinden indirdiğin PDF ekstreyi yükle.",
  too_large: "Dosya 4 MB'tan büyük.",
  too_many_pages: "Ekstre 30 sayfadan uzun.",
  password_required: "Bu PDF parolalı. Bankanın ekstre parolasını gir.",
  wrong_password: "Parola yanlış.",
  unavailable: "Ekstre şu anda okunamıyor; biraz sonra yeniden dene.",
};

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/** Ayrıştırılan satırları kullanıcının kartı için önerilerle zenginleştirir. */
export async function reviewStatement(
  userId: string,
  userCardId: string,
  parsed: StatementParseResult,
  today = turkeyToday(),
): Promise<MutationResult<StatementReview>> {
  const prisma = getPrisma();
  const card = await prisma.userCard.findFirst({
    where: { id: userCardId, userId },
    select: { id: true },
  });
  if (!card) return { ok: false, code: "not_found", error: "Kart bulunamadı." };

  const days = parsed.rows.map((row) => row.date).sort();
  const [merchants, categories, existing] = await Promise.all([
    prisma.merchant.findMany({ select: { id: true, name: true, categoryId: true } }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    days.length
      ? prisma.transaction.findMany({
          where: {
            userCardId,
            date: { gte: toDate(days[0]!), lte: toDate(days[days.length - 1]!) },
          },
          select: { date: true, amountKurus: true },
        })
      : [],
  ]);
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const root = (id: string) => parent.get(id) ?? id; // katalog iki seviyeli
  const known = new Set(existing.map((txn) => `${toDay(txn.date)}|${txn.amountKurus}`));
  const earliest = earliestTransactionDay(today);

  return {
    ok: true,
    data: {
      parser: parsed.parser,
      skippedCredits: parsed.skippedCredits,
      unparsedLines: parsed.unparsedLines,
      rows: parsed.rows.map((row) => {
        const merchant = suggestMerchant(row.description, merchants);
        return {
          ...row,
          merchantId: merchant?.id ?? null,
          categoryId: merchant ? root(merchant.categoryId) : null,
          duplicate: known.has(`${row.date}|${row.amountKurus}`),
          outOfRange: row.date > today || row.date < earliest,
        };
      }),
    },
  };
}

/** Onaylanan satırları tek işlemde harcama olarak yazar; eklenen sayı. */
export async function importStatementRows(
  userId: string,
  input: StatementImportInput,
  today = turkeyToday(),
): Promise<MutationResult<{ imported: number }>> {
  const prisma = getPrisma();
  const earliest = earliestTransactionDay(today);
  if (input.rows.some((row) => row.date > today || row.date < earliest)) {
    return {
      ok: false,
      code: "conflict",
      error: "Son 90 günün dışında ya da ileri tarihli satır var; onları seçme.",
    };
  }
  const categoryIds = [...new Set(input.rows.map((row) => row.categoryId))];
  const merchantIds = [
    ...new Set(input.rows.flatMap((row) => (row.merchantId ? [row.merchantId] : []))),
  ];
  const [card, roots, merchants] = await Promise.all([
    prisma.userCard.findFirst({ where: { id: input.userCardId, userId }, select: { id: true } }),
    prisma.category.count({ where: { id: { in: categoryIds }, parentId: null } }),
    prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true, categoryId: true, category: { select: { parentId: true } } },
    }),
  ]);
  if (!card) return { ok: false, code: "not_found", error: "Kart bulunamadı." };
  if (roots !== categoryIds.length) {
    return { ok: false, code: "not_found", error: "Seçilen kategorilerden biri bulunamadı." };
  }
  const merchantRoot = new Map(merchants.map((m) => [m.id, m.category.parentId ?? m.categoryId]));
  if (
    input.rows.some((row) => row.merchantId && merchantRoot.get(row.merchantId) !== row.categoryId)
  ) {
    return { ok: false, code: "not_found", error: "Bir satırın markası seçilen kategoride değil." };
  }

  const { count } = await prisma.transaction.createMany({
    data: input.rows.map((row) => ({
      userId,
      userCardId: input.userCardId,
      categoryId: row.categoryId,
      merchantId: row.merchantId,
      amountKurus: row.amountKurus,
      date: toDate(row.date),
      source: "STATEMENT" as const,
    })),
  });
  track(userId, "statement_imported", { rows: count });
  return { ok: true, data: { imported: count } };
}
