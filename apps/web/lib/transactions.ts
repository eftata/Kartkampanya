import "server-only";

import { getPrisma } from "@kartplan/db";
import { TRANSACTION_MAX_AGE_DAYS } from "@kartplan/shared";
import type { TransactionDto, TransactionInput } from "@kartplan/shared";

import { track } from "@/lib/analytics";
import { turkeyToday } from "@/lib/campaign-match";
import { monthBounds } from "@/lib/plan-request";
import type { MutationResult } from "@/lib/result";

/**
 * Elle girilen harcamalar (Faz 2; ADR 0027). Sahiplik sorguda (`userId`) denetlenir. Kategori ana
 * kategori olmalı (harcama profili ve plan ana kategoriyle çalışır); marka o kategoride olmalı.
 */

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

const include = {
  userCard: { select: { nickname: true, cardProduct: { select: { name: true } } } },
  category: { select: { name: true } },
  merchant: { select: { name: true } },
} as const;

type Row = {
  id: string;
  userCardId: string;
  categoryId: string;
  merchantId: string | null;
  amountKurus: number;
  date: Date;
  userCard: { nickname: string | null; cardProduct: { name: string } };
  category: { name: string };
  merchant: { name: string } | null;
};

const toDto = (row: Row): TransactionDto => ({
  id: row.id,
  userCardId: row.userCardId,
  cardName: row.userCard.nickname || row.userCard.cardProduct.name,
  categoryId: row.categoryId,
  categoryName: row.category.name,
  merchantId: row.merchantId,
  merchantName: row.merchant?.name ?? null,
  amountKurus: row.amountKurus,
  date: toDay(row.date),
});

/** En eski girilebilecek gün (bugün dahil `TRANSACTION_MAX_AGE_DAYS` gün). */
export function earliestTransactionDay(today: string): string {
  return toDay(new Date(toDate(today).getTime() - (TRANSACTION_MAX_AGE_DAYS - 1) * 86_400_000));
}

export async function addTransaction(
  userId: string,
  input: TransactionInput,
  today = turkeyToday(),
): Promise<MutationResult<TransactionDto>> {
  if (input.date > today) {
    return { ok: false, code: "conflict", error: "İleri tarihli harcama girilemez." };
  }
  if (input.date < earliestTransactionDay(today)) {
    return {
      ok: false,
      code: "conflict",
      error: `En fazla ${TRANSACTION_MAX_AGE_DAYS} gün öncesinin harcaması girilebilir.`,
    };
  }
  const prisma = getPrisma();
  const [card, category, merchant] = await Promise.all([
    prisma.userCard.findFirst({ where: { id: input.userCardId, userId }, select: { id: true } }),
    prisma.category.findFirst({
      where: { id: input.categoryId, parentId: null },
      select: { id: true },
    }),
    input.merchantId
      ? prisma.merchant.findUnique({
          where: { id: input.merchantId },
          select: { categoryId: true, category: { select: { parentId: true } } },
        })
      : null,
  ]);
  if (!card) return { ok: false, code: "not_found", error: "Kart bulunamadı." };
  if (!category) return { ok: false, code: "not_found", error: "Kategori bulunamadı." };
  if (
    input.merchantId &&
    (!merchant ||
      (merchant.categoryId !== input.categoryId && merchant.category.parentId !== input.categoryId))
  ) {
    return { ok: false, code: "not_found", error: "Seçilen marka bu kategoride değil." };
  }

  const row = await prisma.transaction.create({
    data: {
      userId,
      userCardId: input.userCardId,
      categoryId: input.categoryId,
      merchantId: input.merchantId,
      amountKurus: input.amountKurus,
      date: toDate(input.date),
    },
    include,
  });
  track(userId, "transaction_added");
  return { ok: true, data: toDto(row) };
}

export async function deleteTransaction(userId: string, id: string): Promise<MutationResult> {
  const { count } = await getPrisma().transaction.deleteMany({ where: { id, userId } });
  return count === 1
    ? { ok: true, data: undefined }
    : { ok: false, code: "not_found", error: "Harcama bulunamadı." };
}

/** Ayın harcamaları, yeniden eskiye. */
export async function listTransactions(userId: string, month: string): Promise<TransactionDto[]> {
  const { first, last } = monthBounds(month);
  const rows = await getPrisma().transaction.findMany({
    where: { userId, date: { gte: toDate(first), lte: toDate(last) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include,
  });
  return rows.map(toDto);
}

/** Ayın kategori başına harcaması ile harcama profilindeki aylık tutar. */
export async function monthSpendSummary(userId: string, month: string) {
  const prisma = getPrisma();
  const { first, last } = monthBounds(month);
  const [spent, profile] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, date: { gte: toDate(first), lte: toDate(last) } },
      _sum: { amountKurus: true },
    }),
    prisma.spendProfile.findMany({
      where: { userId },
      select: { categoryId: true, monthlyKurus: true, category: { select: { name: true } } },
    }),
  ]);
  const spentBy = new Map(spent.map((row) => [row.categoryId, row._sum.amountKurus ?? 0]));
  const rows = profile.map((item) => ({
    categoryId: item.categoryId,
    categoryName: item.category.name,
    plannedKurus: item.monthlyKurus,
    spentKurus: spentBy.get(item.categoryId) ?? 0,
  }));
  // Profilde olmayan kategorideki harcamalar da görünsün.
  const known = new Set(rows.map((row) => row.categoryId));
  const extra = [...spentBy].filter(([id]) => !known.has(id));
  if (extra.length) {
    const names = new Map(
      (
        await prisma.category.findMany({
          where: { id: { in: extra.map(([id]) => id) } },
          select: { id: true, name: true },
        })
      ).map((row) => [row.id, row.name]),
    );
    for (const [categoryId, spentKurus] of extra) {
      rows.push({
        categoryId,
        categoryName: names.get(categoryId) ?? "",
        plannedKurus: 0,
        spentKurus,
      });
    }
  }
  return rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "tr"));
}
