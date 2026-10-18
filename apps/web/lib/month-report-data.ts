import "server-only";

import { getPrisma } from "@kartplan/db";
import type { MonthReportDto } from "@kartplan/shared";

import { turkeyToday } from "@/lib/campaign-match";
import { computeMonthReport } from "@/lib/month-report";
import type { MonthReport, ReportCampaign, ReportTransaction } from "@/lib/month-report";
import { monthBounds } from "@/lib/plan-request";

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export type MonthReportView = MonthReport & {
  categoryName: Record<string, string>;
  /** O ayın planındaki beklenti (plan hesaplandıysa). */
  expectedKurus: number | null;
  /** Kartlardan birinin oranı doğrulanmamış (temel kazanç tahmini belirsiz). */
  unverifiedRates: boolean;
};

/**
 * Ayın raporu (ADR 0029). Ay bittiyse gerçekleşen kazanç (`campaign + base`) o ayın planına
 * (`MonthlyPlan.realizedKurus`) yazılır.
 */
export async function getMonthReport(
  userId: string,
  month: string,
  today = turkeyToday(),
): Promise<MonthReportView> {
  const prisma = getPrisma();
  const { first, last } = monthBounds(month);
  const [cards, categories, plan] = await Promise.all([
    prisma.userCard.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nickname: true,
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
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.monthlyPlan.findUnique({
      where: { userId_month: { userId, month } },
      select: { expectedKurus: true },
    }),
  ]);
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const rootOf = (id: string) => parent.get(id) ?? id; // katalog iki seviyeli

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["APPROVED", "EXPIRED"] },
      programId: { in: [...new Set(cards.map((card) => card.cardProduct.programId))] },
      endsAt: { gte: toDate(first), lte: toDate(last) },
    },
    orderBy: { id: "asc" },
    include: {
      rules: { orderBy: { id: "asc" } },
      cardScope: { select: { cardProductId: true } },
      userStatus: { where: { userId }, select: { joined: true } },
    },
  });
  const since = campaigns.reduce(
    (min, campaign) => (toDay(campaign.startsAt) < min ? toDay(campaign.startsAt) : min),
    first,
  );
  const transactions: ReportTransaction[] = (
    await prisma.transaction.findMany({
      where: { userId, date: { gte: toDate(since), lte: toDate(last) } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        userCardId: true,
        categoryId: true,
        merchantId: true,
        amountKurus: true,
        date: true,
        userCard: { select: { cardProductId: true, cardProduct: { select: { programId: true } } } },
      },
    })
  ).map((txn) => ({
    userCardId: txn.userCardId,
    programId: txn.userCard.cardProduct.programId,
    cardProductId: txn.userCard.cardProductId,
    categoryId: txn.categoryId,
    merchantId: txn.merchantId,
    amountKurus: txn.amountKurus,
    date: toDay(txn.date),
  }));

  const report = computeMonthReport({
    month,
    today,
    rootOf,
    transactions,
    campaigns: campaigns.map((campaign): ReportCampaign => ({
      id: campaign.id,
      title: campaign.title,
      programId: campaign.programId,
      cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
      startsAt: toDay(campaign.startsAt),
      endsAt: toDay(campaign.endsAt),
      joinRequired: campaign.joinMethod !== "AUTO",
      joined: campaign.userStatus[0]?.joined ?? false,
      rules: campaign.rules,
    })),
    cards: cards.map((card) => {
      const rates = new Map<string, number>();
      for (const rate of card.cardProduct.earnRates) {
        const root = rootOf(rate.categoryId);
        rates.set(root, Math.max(rates.get(root) ?? 0, rate.rateBps));
      }
      return {
        id: card.id,
        name: card.nickname || card.cardProduct.name,
        baseRateBps: card.cardProduct.baseRateBps,
        rates,
      };
    }),
  });

  if (report.closed && plan) {
    await prisma.monthlyPlan.update({
      where: { userId_month: { userId, month } },
      data: { realizedKurus: report.campaignEarnedKurus + report.baseEarnedKurus },
    });
  }
  return {
    ...report,
    categoryName: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    expectedKurus: plan?.expectedKurus ?? null,
    unverifiedRates: cards.some((card) => card.cardProduct.ratesVerifiedAt === null),
  };
}

/** Raporu olabilecek aylar: harcama ya da plan olan son 12 ay, yeniden eskiye. */
export async function getReportMonths(userId: string, today = turkeyToday()): Promise<string[]> {
  const prisma = getPrisma();
  const current = today.slice(0, 7);
  const [plans, transactions] = await Promise.all([
    prisma.monthlyPlan.findMany({ where: { userId }, select: { month: true } }),
    prisma.transaction.findMany({
      where: { userId },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "desc" },
      take: 400,
    }),
  ]);
  const months = new Set([
    ...plans.map((plan) => plan.month),
    ...transactions.map((txn) => toDay(txn.date).slice(0, 7)),
  ]);
  return [...months]
    .filter((month) => month <= current)
    .sort()
    .reverse()
    .slice(0, 12);
}

/** API biçimi (`MonthReportDto`). */
export function toMonthReportDto(view: MonthReportView): MonthReportDto {
  return {
    month: view.month,
    closed: view.closed,
    spentKurus: view.spentKurus,
    spentByCategory: view.spentByCategory.map((row) => ({
      category: view.categoryName[row.categoryId] ?? row.categoryId,
      spentKurus: row.spentKurus,
    })),
    baseEarnedKurus: view.baseEarnedKurus,
    campaignEarnedKurus: view.campaignEarnedKurus,
    expectedKurus: view.expectedKurus,
    earned: view.earned.map(({ id, ...rest }) => ({ campaignId: id, ...rest })),
    missed: view.missed.map(({ id, ...rest }) => ({ campaignId: id, ...rest })),
    ongoing: view.ongoing,
  };
}
