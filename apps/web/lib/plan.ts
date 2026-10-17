import "server-only";

import { getPrisma } from "@kartplan/db";
import type { PlanResponse } from "@kartplan/shared";

import { turkeyToday } from "@/lib/campaign-match";
import { optimizePlan } from "@/lib/engine";
import { buildPlanRequest, monthBounds } from "@/lib/plan-request";

const toDay = (date: Date) => date.toISOString().slice(0, 10);

export type PlanCampaignRef = {
  id: string;
  title: string;
  joinRequired: boolean;
  joined: boolean;
};

export type PlanView = {
  month: string;
  plan: PlanResponse;
  /** Motorun kimlikleri → görünen adlar. */
  categoryName: Record<string, string>;
  cardName: Record<string, string>;
  /** Kural id'si → kampanya. */
  ruleCampaign: Record<string, PlanCampaignRef>;
  /** Kartlardan birinin oranları kaynaktan doğrulanmamış (seed tahmini). */
  unverifiedRates: boolean;
};

export type PlanResult =
  | { status: "ok"; view: PlanView }
  | { status: "incomplete" } // kart ya da harcama profili yok
  | { status: "error"; error: string };

/** Bu ayın planı: kullanıcı verisinden PlanRequest kurar, motoru çağırır (ADR 0016). */
export async function getMonthlyPlan(userId: string, today = turkeyToday()): Promise<PlanResult> {
  const prisma = getPrisma();
  const month = today.slice(0, 7);
  const { last } = monthBounds(month);
  const [cards, spend, categories, merchants] = await Promise.all([
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
    prisma.spendProfile.findMany({
      where: { userId },
      select: { categoryId: true, monthlyKurus: true, merchantIds: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.merchant.findMany({ select: { id: true, categoryId: true } }),
  ]);
  if (cards.length === 0 || spend.length === 0) return { status: "incomplete" };

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "APPROVED",
      programId: { in: [...new Set(cards.map((card) => card.cardProduct.programId))] },
      endsAt: { gte: new Date(`${today}T00:00:00Z`) },
      startsAt: { lte: new Date(`${last}T00:00:00Z`) },
    },
    include: {
      rules: { orderBy: { id: "asc" } },
      cardScope: { select: { cardProductId: true } },
      userStatus: { where: { userId }, select: { joined: true } },
    },
  });

  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const root = (id: string) => {
    let current = id;
    for (let depth = 0; depth < 10; depth++) {
      const next = parent.get(current);
      if (!next) break;
      current = next;
    }
    return current;
  };

  const request = buildPlanRequest({
    month,
    today,
    spend,
    cards: cards.map((card) => ({
      id: card.id,
      programId: card.cardProduct.programId,
      cardProductId: card.cardProductId,
      limitKurus: card.limitKurus,
      baseRateBps: card.cardProduct.baseRateBps,
      earnRates: card.cardProduct.earnRates,
    })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      programId: campaign.programId,
      cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
      startsAt: toDay(campaign.startsAt),
      endsAt: toDay(campaign.endsAt),
      joinRequired: campaign.joinMethod !== "AUTO",
      joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
      joined: campaign.userStatus[0]?.joined ?? false,
      rules: campaign.rules,
    })),
    rootOf: new Map(categories.map((c) => [c.id, root(c.id)])),
    merchantCategory: new Map(merchants.map((m) => [m.id, m.categoryId])),
  });

  const result = await optimizePlan(request);
  if (!result.ok) return { status: "error", error: result.error };

  const ruleCampaign: Record<string, PlanCampaignRef> = {};
  for (const campaign of campaigns) {
    const ref = {
      id: campaign.id,
      title: campaign.title,
      joinRequired: campaign.joinMethod !== "AUTO",
      joined: campaign.userStatus[0]?.joined ?? false,
    };
    for (const rule of campaign.rules) ruleCampaign[rule.id] = ref;
  }
  return {
    status: "ok",
    view: {
      month,
      plan: result.plan,
      categoryName: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      cardName: Object.fromEntries(
        cards.map((card) => [card.id, card.nickname || card.cardProduct.name]),
      ),
      ruleCampaign,
      unverifiedRates: cards.some((card) => card.cardProduct.ratesVerifiedAt === null),
    },
  };
}
