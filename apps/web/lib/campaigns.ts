import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import type { MyCampaignDto, MyCampaignsQuery } from "@kartplan/shared";

import { matchCampaign, turkeyToday } from "@/lib/campaign-match";
import type { Match, MatchUser, Taxonomy } from "@/lib/campaign-match";

const toDay = (date: Date) => date.toISOString().slice(0, 10);
const ENDING_SOON_DAYS = 7;

type Db = ReturnType<typeof getPrisma>;

/** Eşleştirme için kullanıcı bağlamı: kartlar, harcama profili (ana kategoriye göre), taksonomi. */
async function loadContext(prisma: Db, userId: string) {
  const [cards, spend, categories, merchants] = await Promise.all([
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
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.merchant.findMany({ select: { id: true, name: true, categoryId: true } }),
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
  return {
    taxonomy,
    programIds: [...new Set(cards.map((card) => card.cardProduct.programId))],
    categoryName: new Map(categories.map((c) => [c.id, c.name])),
    merchantName: new Map(merchants.map((m) => [m.id, m.name])),
    cardName: new Map(cards.map((c) => [c.id, c.nickname || c.cardProduct.name])),
    user: {
      cards: cards.map((card) => ({
        id: card.id,
        cardProductId: card.cardProductId,
        programId: card.cardProduct.programId,
      })),
      spend: new Map(spend.map((item) => [root(item.categoryId), item.monthlyKurus])),
    } satisfies MatchUser,
  };
}
type Context = Awaited<ReturnType<typeof loadContext>>;

const campaignInclude = (userId: string) =>
  ({
    program: { select: { name: true, bank: { select: { name: true } } } },
    rules: { orderBy: { id: "asc" } },
    cardScope: { select: { cardProductId: true, cardProduct: { select: { name: true } } } },
    userStatus: { where: { userId }, select: { joined: true, inPlan: true } },
  }) as const;

type LoadedCampaign = Prisma.CampaignGetPayload<{
  include: ReturnType<typeof campaignInclude>;
}>;

function evaluate(campaign: LoadedCampaign, context: Context, today: string) {
  return matchCampaign(
    {
      programId: campaign.programId,
      cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
      startsAt: toDay(campaign.startsAt),
      endsAt: toDay(campaign.endsAt),
      joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
      rules: campaign.rules,
    },
    context.user,
    context.taxonomy,
    today,
  );
}

/** Kampanya → liste DTO'su. Eşleşme yoksa (detay sayfası) kart/kategori boş, tahmin 0. */
function toDto(
  campaign: LoadedCampaign,
  match: Match | null,
  context: Context,
  today: string,
): MyCampaignDto {
  const startsAt = toDay(campaign.startsAt);
  const endsAt = toDay(campaign.endsAt);
  return {
    id: campaign.id,
    title: campaign.title,
    summary: campaign.summary,
    sourceUrl: campaign.sourceUrl,
    bankName: campaign.program.bank.name,
    programName: campaign.program.name,
    startsAt,
    endsAt,
    joinMethod: campaign.joinMethod,
    joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
    cards: (match?.cardIds ?? []).map((id) => ({ id, name: context.cardName.get(id) ?? "" })),
    categories: (match?.categoryIds ?? [])
      .map((id) => ({ id, name: context.categoryName.get(id) ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    rewardTypes: match?.rewardTypes ?? [...new Set(campaign.rules.map((rule) => rule.rewardType))],
    estimateKurus: match?.estimateKurus ?? 0,
    joinRequired: campaign.joinMethod !== "AUTO",
    endingSoon: daysLeft(today, endsAt) <= ENDING_SOON_DAYS,
    upcoming: startsAt > today,
    joined: campaign.userStatus[0]?.joined ?? false,
    inPlan: campaign.userStatus[0]?.inPlan ?? false,
  };
}

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
  const context = await loadContext(prisma, userId);
  if (context.user.cards.length === 0 || context.user.spend.size === 0) return [];

  const todayDate = new Date(`${today}T00:00:00Z`);
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "APPROVED",
      programId: { in: context.programIds },
      endsAt: { gte: todayDate },
      OR: [{ joinDeadline: null }, { joinDeadline: { gte: todayDate } }],
    },
    include: campaignInclude(userId),
  });

  const result: MyCampaignDto[] = [];
  for (const campaign of campaigns) {
    const match = evaluate(campaign, context, today);
    if (!match) continue;
    if (query.card && !match.cardIds.includes(query.card)) continue;
    if (query.category && !match.categoryIds.includes(query.category)) continue;
    if (query.type && !match.rewardTypes.includes(query.type)) continue;
    result.push(toDto(campaign, match, context, today));
  }

  const byEnd = (a: MyCampaignDto, b: MyCampaignDto) =>
    a.endsAt.localeCompare(b.endsAt) || a.title.localeCompare(b.title, "tr");
  return result.sort(
    query.sort === "gain" ? (a, b) => b.estimateKurus - a.estimateKurus || byEnd(a, b) : byEnd,
  );
}

/**
 * Kampanya detayı: onaylı ya da süresi dolmuş her kampanya açılır (plan veya paylaşılan bağlantı);
 * taslak/reddedilen null (404). `matches` kullanıcının kartlarına ve alanlarına uyup uymadığı.
 */
export async function getMyCampaignDetail(userId: string, id: string, today = turkeyToday()) {
  const prisma = getPrisma();
  const [context, campaign] = await Promise.all([
    loadContext(prisma, userId),
    prisma.campaign.findFirst({
      where: { id, status: { in: ["APPROVED", "EXPIRED"] } },
      include: campaignInclude(userId),
    }),
  ]);
  if (!campaign) return null;
  const match = evaluate(campaign, context, today);
  const names = (ids: string[], map: Map<string, string>) =>
    ids.map((i) => map.get(i)).filter((name): name is string => Boolean(name));
  return {
    campaign: toDto(campaign, match, context, today),
    matches: match !== null,
    expired: campaign.status === "EXPIRED" || toDay(campaign.endsAt) < today,
    scopeCards: campaign.cardScope.map((card) => card.cardProduct.name).sort(),
    lastSeenAt: campaign.lastSeenAt,
    rules: campaign.rules.map((rule) => ({
      ...rule,
      categoryNames: names(rule.categoryIds, context.categoryName),
      merchantNames: names(rule.merchantIds, context.merchantName),
    })),
  };
}
export type MyCampaignDetail = NonNullable<Awaited<ReturnType<typeof getMyCampaignDetail>>>;

/** Bugün dahil kalan gün (bitiş günü bugünse 1). */
function daysLeft(today: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(today)) / 86_400_000) + 1;
}
