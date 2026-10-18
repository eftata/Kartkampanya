import "server-only";

import { getPrisma } from "@kartplan/db";
import { ADVICE_MAX_DAYS_AHEAD } from "@kartplan/shared";
import type { PurchaseAdviceDto, PurchaseAdviceInput } from "@kartplan/shared";

import { daysBetween, turkeyToday } from "@/lib/campaign-match";
import type { ProgressTransaction } from "@/lib/campaign-progress";
import { monthBounds } from "@/lib/plan-request";
import { advisePurchase } from "@/lib/purchase-advisor";
import type { AdvisorCampaign } from "@/lib/purchase-advisor";
import type { MutationResult } from "@/lib/result";

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Tek alışveriş için kartların kazancı (ADR 0030). Hiçbir şey kaydetmez: alışveriş varsayımsaldır,
 * kullanıcının mevcut harcamaları ve kampanya katılımlarıyla hesaplanır.
 */
export async function getPurchaseAdvice(
  userId: string,
  input: PurchaseAdviceInput,
  today = turkeyToday(),
): Promise<MutationResult<PurchaseAdviceDto>> {
  const date = input.date ?? today;
  if (date < today) return { ok: false, code: "conflict", error: "Geçmiş bir gün seçilemez." };
  if (daysBetween(today, date) - 1 > ADVICE_MAX_DAYS_AHEAD) {
    return {
      ok: false,
      code: "conflict",
      error: `En fazla ${ADVICE_MAX_DAYS_AHEAD} gün sonrası için hesaplanır.`,
    };
  }
  const prisma = getPrisma();
  const [cards, category, merchant, categories] = await Promise.all([
    prisma.userCard.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nickname: true,
        limitKurus: true,
        cardProductId: true,
        cardProduct: {
          select: {
            name: true,
            programId: true,
            baseRateBps: true,
            ratesVerifiedAt: true,
            earnRates: { select: { categoryId: true, rateBps: true } },
          },
        },
      },
    }),
    prisma.category.findFirst({ where: { id: input.categoryId, parentId: null } }),
    input.merchantId
      ? prisma.merchant.findUnique({
          where: { id: input.merchantId },
          select: { categoryId: true, category: { select: { parentId: true } } },
        })
      : null,
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);
  if (cards.length === 0) return { ok: false, code: "not_found", error: "Önce kartlarını ekle." };
  if (!category) return { ok: false, code: "not_found", error: "Kategori bulunamadı." };
  if (
    input.merchantId &&
    (!merchant || (merchant.category.parentId ?? merchant.categoryId) !== input.categoryId)
  ) {
    return { ok: false, code: "not_found", error: "Seçilen marka bu kategoride değil." };
  }
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const rootOf = (id: string) => parent.get(id) ?? id; // katalog iki seviyeli

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "APPROVED",
      programId: { in: [...new Set(cards.map((card) => card.cardProduct.programId))] },
      startsAt: { lte: toDate(date) },
      endsAt: { gte: toDate(date) },
    },
    orderBy: { id: "asc" },
    include: {
      rules: { orderBy: { id: "asc" } },
      cardScope: { select: { cardProductId: true } },
      userStatus: { where: { userId }, select: { joined: true } },
    },
  });
  const { first, last } = monthBounds(date.slice(0, 7));
  const since = campaigns.reduce(
    (min, campaign) => (toDay(campaign.startsAt) < min ? toDay(campaign.startsAt) : min),
    first,
  );
  const rows = await prisma.transaction.findMany({
    where: { userId, date: { gte: toDate(since), lte: toDate(today < last ? today : last) } },
    select: {
      userCardId: true,
      categoryId: true,
      merchantId: true,
      amountKurus: true,
      date: true,
      userCard: { select: { cardProductId: true, cardProduct: { select: { programId: true } } } },
    },
  });
  const transactions: ProgressTransaction[] = rows.map((txn) => ({
    programId: txn.userCard.cardProduct.programId,
    cardProductId: txn.userCard.cardProductId,
    categoryId: txn.categoryId,
    merchantId: txn.merchantId,
    amountKurus: txn.amountKurus,
    date: toDay(txn.date),
  }));
  const spentThisMonth = new Map<string, number>();
  for (const txn of rows) {
    if (toDay(txn.date) < first) continue;
    spentThisMonth.set(txn.userCardId, (spentThisMonth.get(txn.userCardId) ?? 0) + txn.amountKurus);
  }

  const advice = advisePurchase({
    purchase: {
      amountKurus: input.amountKurus,
      categoryId: input.categoryId,
      merchantId: input.merchantId,
      date,
    },
    rootOf,
    transactions,
    cards: cards.map((card) => {
      const rates = new Map<string, number>();
      for (const rate of card.cardProduct.earnRates) {
        const root = rootOf(rate.categoryId);
        rates.set(root, Math.max(rates.get(root) ?? 0, rate.rateBps));
      }
      return {
        id: card.id,
        name: card.nickname || card.cardProduct.name,
        programId: card.cardProduct.programId,
        cardProductId: card.cardProductId,
        baseRateBps: card.cardProduct.baseRateBps,
        rates,
        limitKurus: card.limitKurus,
        spentThisMonthKurus: spentThisMonth.get(card.id) ?? 0,
      };
    }),
    campaigns: campaigns.map((campaign): AdvisorCampaign => ({
      id: campaign.id,
      title: campaign.title,
      programId: campaign.programId,
      cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
      startsAt: toDay(campaign.startsAt),
      endsAt: toDay(campaign.endsAt),
      joinRequired: campaign.joinMethod !== "AUTO",
      joined: campaign.userStatus[0]?.joined ?? false,
      joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
      rules: campaign.rules,
    })),
  });
  return {
    ok: true,
    data: {
      date,
      cards: advice,
      unverifiedRates: cards.some((card) => card.cardProduct.ratesVerifiedAt === null),
    },
  };
}
