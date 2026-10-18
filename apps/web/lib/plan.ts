import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import { PlanResponse } from "@kartplan/shared";
import type { PlanRequestInput } from "@kartplan/shared";

import { turkeyToday } from "@/lib/campaign-match";
import { ruleProgress } from "@/lib/campaign-progress";
import type { ProgressTransaction, RuleProgress } from "@/lib/campaign-progress";
import { optimizePlan } from "@/lib/engine";
import { buildPlanRequest, monthBounds, planInputHash } from "@/lib/plan-request";
import type { PlanSpent } from "@/lib/plan-request";

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
  computedAt: Date;
  /** Veriler değişti ama motora ulaşılamadı: son kayıtlı plan gösteriliyor. */
  stale: boolean;
  /** Faz 2 (ADR 0027): bu ay girilen harcamalar ve kampanya ilerlemesi. */
  tracking: PlanTracking;
};

export type CampaignProgressView = {
  campaign: PlanCampaignRef;
  rules: (RuleProgress & { ruleId: string })[];
  earnedKurus: number;
};

export type PlanTracking = {
  /** Bu ay harcama girildi: plan ayın kalanı için (kalan bütçe ve limitlerle). */
  remainingMode: boolean;
  spentKurus: number;
  /** Kampanyalardan şimdiye kadar kazanılan tahmini ödül. */
  earnedKurus: number;
  /** Plandaki, katılınan ya da harcama sayılan kampanyaların ilerlemesi. */
  campaigns: CampaignProgressView[];
};

export type PlanResult =
  | { status: "ok"; view: PlanView }
  | { status: "incomplete" } // kart ya da harcama profili yok
  | { status: "error"; error: string };

/**
 * Bu ayın planı (ADR 0016, 0017): kullanıcı verisinden PlanRequest kurulur. Özeti kayıtlı planla
 * aynıysa kayıtlı sonuç döner (motor çağrılmaz); değilse ya da `force` ise yeniden hesaplanır ve
 * kaydedilir. Motora ulaşılamazsa son kayıtlı plan `stale` olarak döner.
 */
export async function getMonthlyPlan(
  userId: string,
  { today = turkeyToday(), force = false }: { today?: string; force?: boolean } = {},
): Promise<PlanResult> {
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
      orderBy: { categoryId: "asc" }, // özet kararlı olsun diye sıralı
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
    orderBy: { id: "asc" },
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

  // Harcama takibi (Faz 2): kampanya pencerelerinin en erken başlangıcından bugüne harcamalar.
  const { first } = monthBounds(month);
  const since = campaigns.reduce(
    (min, campaign) => (toDay(campaign.startsAt) < min ? toDay(campaign.startsAt) : min),
    first,
  );
  const transactions = (
    await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) },
      },
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
  })) satisfies (ProgressTransaction & { userCardId: string })[];
  const monthTransactions = transactions.filter((txn) => txn.date >= first);

  const rootOf = (id: string) => root(id);
  const progress = new Map<string, RuleProgress>();
  for (const campaign of campaigns) {
    const scope = {
      programId: campaign.programId,
      cardProductIds: campaign.cardScope.map((card) => card.cardProductId),
      startsAt: toDay(campaign.startsAt),
      endsAt: toDay(campaign.endsAt),
    };
    for (const rule of campaign.rules) {
      progress.set(rule.id, ruleProgress(rule, scope, transactions, rootOf));
    }
  }
  const sumBy = (key: "categoryId" | "userCardId") => {
    const totals = new Map<string, number>();
    for (const txn of monthTransactions) {
      totals.set(txn[key], (totals.get(txn[key]) ?? 0) + txn.amountKurus);
    }
    return totals;
  };
  const spent: PlanSpent | undefined =
    monthTransactions.length > 0
      ? { byCategory: sumBy("categoryId"), byCard: sumBy("userCardId"), progress }
      : undefined;

  const request = buildPlanRequest({
    month,
    today,
    spent,
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

  const inputHash = planInputHash(request);
  const stored = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month } },
    select: { inputHash: true, result: true, computedAt: true },
  });
  // Ödülü (kısmen) kazanılmış kurallar planda olmasa da kampanya "plana dahil" kalır.
  const earnedRules = [...progress].filter(([, item]) => item.tiers > 0).map(([id]) => id);
  let plan: PlanResponse;
  let computedAt: Date;
  let stale = false;
  if (stored && stored.inputHash === inputHash && !force) {
    plan = PlanResponse.parse(stored.result);
    computedAt = stored.computedAt;
  } else {
    const result = await optimizePlan(request);
    if (result.ok) {
      plan = result.plan;
      computedAt = new Date();
      await savePlan(userId, month, request, inputHash, plan, computedAt, campaigns, earnedRules);
    } else if (stored) {
      plan = PlanResponse.parse(stored.result);
      computedAt = stored.computedAt;
      stale = true;
    } else {
      return { status: "error", error: result.error };
    }
  }

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
  const hitRules = new Set(plan.campaignsHit.map((hit) => hit.id));
  const tracked: CampaignProgressView[] = [];
  for (const campaign of campaigns) {
    const rules = campaign.rules.map((rule) => ({ ruleId: rule.id, ...progress.get(rule.id)! }));
    const relevant =
      rules.some((rule) => rule.matched > 0 || hitRules.has(rule.ruleId)) ||
      (campaign.userStatus[0]?.joined ?? false);
    if (!relevant) continue;
    // Çok kurallı kampanyada kurallar alternatif kademelerdir: en yüksek kazanç sayılır.
    const earnedKurus = Math.max(0, ...rules.map((rule) => rule.earnedKurus));
    tracked.push({ campaign: ruleCampaign[campaign.rules[0]!.id]!, rules, earnedKurus });
  }
  tracked.sort(
    (a, b) =>
      b.earnedKurus - a.earnedKurus || a.campaign.title.localeCompare(b.campaign.title, "tr"),
  );

  return {
    status: "ok",
    view: {
      month,
      plan,
      tracking: {
        remainingMode: spent !== undefined,
        spentKurus: monthTransactions.reduce((sum, txn) => sum + txn.amountKurus, 0),
        earnedKurus: tracked.reduce((sum, item) => sum + item.earnedKurus, 0),
        campaigns: tracked.filter((item) => item.rules.length > 0),
      },
      categoryName: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      cardName: Object.fromEntries(
        cards.map((card) => [card.id, card.nickname || card.cardProduct.name]),
      ),
      ruleCampaign,
      unverifiedRates: cards.some((card) => card.cardProduct.ratesVerifiedAt === null),
      computedAt,
      stale,
    },
  };
}

/**
 * Planı kaydeder ve "plana dahil" işaretlerini eşitler (tek işlemde): planın ödül aldığı
 * kampanyalar `inPlan = true`, diğerleri false. Kampanya kimliği kural kimliğinden bulunur.
 */
async function savePlan(
  userId: string,
  month: string,
  request: PlanRequestInput,
  inputHash: string,
  plan: PlanResponse,
  computedAt: Date,
  campaigns: { id: string; rules: { id: string }[] }[],
  earnedRules: string[] = [],
) {
  const campaignOf = new Map(campaigns.flatMap((c) => c.rules.map((rule) => [rule.id, c.id])));
  const inPlan = [
    ...new Set(
      [...plan.campaignsHit.map((hit) => hit.id), ...earnedRules]
        .map((id) => campaignOf.get(id))
        .filter((id) => id),
    ),
  ] as string[];
  const data = {
    input: request as Prisma.InputJsonValue,
    inputHash,
    result: plan as Prisma.InputJsonValue,
    expectedKurus: plan.totalExpected,
    baselineKurus: plan.baseline.total,
    computedAt,
  };
  await getPrisma().$transaction([
    getPrisma().monthlyPlan.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, ...data },
      update: data,
    }),
    getPrisma().userCampaignStatus.updateMany({
      where: { userId, inPlan: true, campaignId: { notIn: inPlan } },
      data: { inPlan: false },
    }),
    ...inPlan.map((campaignId) =>
      getPrisma().userCampaignStatus.upsert({
        where: { userId_campaignId: { userId, campaignId } },
        create: { userId, campaignId, inPlan: true },
        update: { inPlan: true },
      }),
    ),
  ]);
}

/** Geçmiş ya da gelecek ay: yalnızca kayıtlı plan (hesaplanmaz). */
export async function getStoredPlan(userId: string, month: string) {
  const row = await getPrisma().monthlyPlan.findUnique({
    where: { userId_month: { userId, month } },
    select: { month: true, result: true, computedAt: true },
  });
  return row
    ? { month: row.month, plan: PlanResponse.parse(row.result), computedAt: row.computedAt }
    : null;
}
