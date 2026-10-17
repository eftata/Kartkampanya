import "server-only";

import { getPrisma } from "@kartplan/db";
import type { MyCampaignDto, MyCampaignsQuery } from "@kartplan/shared";

import { matchCampaign, turkeyToday } from "@/lib/campaign-match";
import type { Taxonomy } from "@/lib/campaign-match";

const toDay = (date: Date) => date.toISOString().slice(0, 10);
const ENDING_SOON_DAYS = 7;

/**
 * Kişiye eşleşen aktif kampanyalar: yalnızca onaylı (APPROVED), bitmemiş, katılım süresi geçmemiş
 * ve kullanıcının kartlarına + harcama alanlarına uyanlar (ADR 0014).
 */
export async function getMyCampaigns(
  userId: string,
  query: MyCampaignsQuery,
  today = turkeyToday(),
): Promise<MyCampaignDto[]> {
  const prisma = getPrisma();
  const [cards, spend] = await Promise.all([
    prisma.userCard.findMany({
      where: { userId },
      select: {
        id: true,
        nickname: true,
        cardProductId: true,
        cardProduct: { select: { name: true, programId: true } },
      },
    }),
    prisma.spendProfile.findMany({
      where: { userId },
      select: { categoryId: true, monthlyKurus: true },
    }),
  ]);
  if (cards.length === 0 || spend.length === 0) return [];

  const todayDate = new Date(`${today}T00:00:00Z`);
  const [categories, merchants, campaigns] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.merchant.findMany({ select: { id: true, categoryId: true } }),
    prisma.campaign.findMany({
      where: {
        status: "APPROVED",
        programId: { in: [...new Set(cards.map((card) => card.cardProduct.programId))] },
        endsAt: { gte: todayDate },
        OR: [{ joinDeadline: null }, { joinDeadline: { gte: todayDate } }],
      },
      include: {
        program: { select: { name: true, bank: { select: { name: true } } } },
        rules: true,
        cardScope: { select: { cardProductId: true } },
      },
    }),
  ]);

  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const root = (id: string): string => {
    let current = id;
    for (let depth = 0; depth < 10; depth++) {
      const next = parent.get(current);
      if (!next) break;
      current = next;
    }
    return current;
  };
  const taxonomy: Taxonomy = {
    rootOf: new Map(categories.map((c) => [c.id, root(c.id)])),
    merchantRoot: new Map(merchants.map((m) => [m.id, root(m.categoryId)])),
  };
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const cardName = new Map(cards.map((c) => [c.id, c.nickname || c.cardProduct.name]));
  const user = {
    cards: cards.map((card) => ({
      id: card.id,
      cardProductId: card.cardProductId,
      programId: card.cardProduct.programId,
    })),
    spend: new Map(spend.map((item) => [root(item.categoryId), item.monthlyKurus])),
  };

  const result: MyCampaignDto[] = [];
  for (const campaign of campaigns) {
    const startsAt = toDay(campaign.startsAt);
    const endsAt = toDay(campaign.endsAt);
    const joinDeadline = campaign.joinDeadline ? toDay(campaign.joinDeadline) : null;
    const match = matchCampaign(
      {
        programId: campaign.programId,
        cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
        startsAt,
        endsAt,
        joinDeadline,
        rules: campaign.rules,
      },
      user,
      taxonomy,
      today,
    );
    if (!match) continue;
    if (query.card && !match.cardIds.includes(query.card)) continue;
    if (query.category && !match.categoryIds.includes(query.category)) continue;
    if (query.type && !match.rewardTypes.includes(query.type)) continue;
    result.push({
      id: campaign.id,
      title: campaign.title,
      summary: campaign.summary,
      sourceUrl: campaign.sourceUrl,
      bankName: campaign.program.bank.name,
      programName: campaign.program.name,
      startsAt,
      endsAt,
      joinMethod: campaign.joinMethod,
      joinDeadline,
      cards: match.cardIds.map((id) => ({ id, name: cardName.get(id) ?? "" })),
      categories: match.categoryIds
        .map((id) => ({ id, name: categoryName.get(id) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
      rewardTypes: match.rewardTypes,
      estimateKurus: match.estimateKurus,
      joinRequired: campaign.joinMethod !== "AUTO",
      endingSoon: daysLeft(today, endsAt) <= ENDING_SOON_DAYS,
      upcoming: startsAt > today,
    });
  }

  const byEnd = (a: MyCampaignDto, b: MyCampaignDto) =>
    a.endsAt.localeCompare(b.endsAt) || a.title.localeCompare(b.title, "tr");
  return result.sort(
    query.sort === "gain" ? (a, b) => b.estimateKurus - a.estimateKurus || byEnd(a, b) : byEnd,
  );
}

/** Bugün dahil kalan gün (bitiş günü bugünse 1). */
function daysLeft(today: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(today)) / 86_400_000) + 1;
}
