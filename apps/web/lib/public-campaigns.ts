import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import type { JoinMethod, RewardType } from "@kartplan/shared";

import { daysBetween, turkeyToday } from "@/lib/campaign-match";
import { campaignPath } from "@/lib/campaign-slug";

/**
 * Herkese açık kampanya sayfaları ve sitemap (ADR 0020). Kişisel veri yok: yalnızca onaylı
 * kampanyalar, kategori/program filtreleri. Listede bitmemiş ve katılım süresi geçmemiş olanlar;
 * detayda süresi dolmuşlar da açılır (paylaşılmış bağlantı) ama arama motoruna kapatılır.
 */

const toDay = (date: Date) => date.toISOString().slice(0, 10);
const ENDING_SOON_DAYS = 7;

export type PublicCampaign = {
  id: string;
  title: string;
  path: string;
  summary: string[];
  bankName: string;
  programName: string;
  startsAt: string;
  endsAt: string;
  joinMethod: JoinMethod;
  joinDeadline: string | null;
  joinRequired: boolean;
  rewardTypes: RewardType[];
  /** Ana kategori adları; boş = tüm harcamalar. */
  categoryNames: string[];
  endingSoon: boolean;
  upcoming: boolean;
};

export type PublicCampaignFilters = { program?: string; category?: string };

type Db = ReturnType<typeof getPrisma>;

async function loadTaxonomy(prisma: Db) {
  const [categories, merchants] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, slug: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    }),
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
  const merchantCategory = new Map(merchants.map((m) => [m.id, m.categoryId]));
  return {
    roots: categories.filter((c) => !c.parentId).map(({ id, slug, name }) => ({ id, slug, name })),
    categoryName: new Map(categories.map((c) => [c.id, c.name])),
    merchantName: new Map(merchants.map((m) => [m.id, m.name])),
    /** Kuralların dokunduğu ana kategoriler; boş = tüm harcamalar (kategorisiz kural varsa). */
    rootsOf(rules: { categoryIds: string[]; merchantIds: string[] }[]): string[] | null {
      const found = new Set<string>();
      for (const rule of rules) {
        if (rule.categoryIds.length === 0 && rule.merchantIds.length === 0) return null;
        rule.categoryIds.forEach((id) => found.add(root(id)));
        for (const id of rule.merchantIds) {
          const category = merchantCategory.get(id);
          if (category) found.add(root(category));
        }
      }
      return [...found];
    },
  };
}
type Taxonomy = Awaited<ReturnType<typeof loadTaxonomy>>;

const include = {
  program: { select: { name: true, slug: true, bank: { select: { name: true } } } },
  rules: { orderBy: { id: "asc" } },
} as const;

type Loaded = {
  id: string;
  title: string;
  summary: string[];
  startsAt: Date;
  endsAt: Date;
  joinMethod: JoinMethod;
  joinDeadline: Date | null;
  program: { name: string; bank: { name: string } };
  rules: { categoryIds: string[]; merchantIds: string[]; rewardType: RewardType }[];
};

function toPublic(campaign: Loaded, roots: string[] | null, taxonomy: Taxonomy, today: string) {
  const startsAt = toDay(campaign.startsAt);
  const endsAt = toDay(campaign.endsAt);
  return {
    id: campaign.id,
    title: campaign.title,
    path: campaignPath(campaign),
    summary: campaign.summary,
    bankName: campaign.program.bank.name,
    programName: campaign.program.name,
    startsAt,
    endsAt,
    joinMethod: campaign.joinMethod,
    joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
    joinRequired: campaign.joinMethod !== "AUTO",
    rewardTypes: [...new Set(campaign.rules.map((rule) => rule.rewardType))],
    categoryNames: (roots ?? [])
      .map((id) => taxonomy.categoryName.get(id) ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "tr")),
    endingSoon: daysBetween(today, endsAt) <= ENDING_SOON_DAYS,
    upcoming: startsAt > today,
  } satisfies PublicCampaign;
}

/** Listede görünen kampanyaların koşulu: onaylı, bitmemiş, katılım süresi geçmemiş. */
function activeWhere(today: string): Prisma.CampaignWhereInput {
  const todayDate = new Date(`${today}T00:00:00Z`);
  return {
    status: "APPROVED",
    endsAt: { gte: todayDate },
    OR: [{ joinDeadline: null }, { joinDeadline: { gte: todayDate } }],
  };
}

/**
 * `/kampanyalar`: aktif kampanyalar + filtre seçenekleri. Kategori filtresi ana kategori
 * slug'ıdır; kategorisiz ("tüm harcamalar") kampanyalar her kategoride görünür.
 */
export async function getPublicCampaigns(filters: PublicCampaignFilters, today = turkeyToday()) {
  const prisma = getPrisma();
  const [taxonomy, campaigns] = await Promise.all([
    loadTaxonomy(prisma),
    prisma.campaign.findMany({
      where: activeWhere(today),
      include,
      orderBy: [{ endsAt: "asc" }, { title: "asc" }],
    }),
  ]);
  const category = filters.category
    ? taxonomy.roots.find((root) => root.slug === filters.category)
    : undefined;

  const programs = new Map<string, string>();
  const items: PublicCampaign[] = [];
  for (const campaign of campaigns) {
    programs.set(campaign.program.slug, `${campaign.program.bank.name} · ${campaign.program.name}`);
    if (filters.program && campaign.program.slug !== filters.program) continue;
    const roots = taxonomy.rootsOf(campaign.rules);
    if (filters.category && roots !== null && (!category || !roots.includes(category.id))) {
      continue;
    }
    items.push(toPublic(campaign, roots, taxonomy, today));
  }
  return {
    campaigns: items,
    programs: [...programs]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    categories: taxonomy.roots.map(({ slug, name }) => ({ slug, name })),
  };
}

/** Kampanya detayı: onaylı ya da süresi dolmuş; taslak/reddedilen null (404). */
export async function getPublicCampaign(id: string, today = turkeyToday()) {
  const prisma = getPrisma();
  const [taxonomy, campaign] = await Promise.all([
    loadTaxonomy(prisma),
    prisma.campaign.findFirst({
      where: { id, status: { in: ["APPROVED", "EXPIRED"] } },
      include: {
        ...include,
        cardScope: { select: { cardProduct: { select: { name: true } } } },
      },
    }),
  ]);
  if (!campaign) return null;
  const names = (ids: string[], map: Map<string, string>) =>
    ids.map((i) => map.get(i)).filter((name): name is string => Boolean(name));
  const endsAt = toDay(campaign.endsAt);
  return {
    campaign: toPublic(campaign, taxonomy.rootsOf(campaign.rules), taxonomy, today),
    expired: campaign.status === "EXPIRED" || endsAt < today,
    /** Katılım süresi geçti (kampanya sürse de yeni katılım olmaz). */
    joinClosed: campaign.joinDeadline !== null && toDay(campaign.joinDeadline) < today,
    scopeCards: campaign.cardScope.map((card) => card.cardProduct.name).sort(),
    sourceUrl: campaign.sourceUrl,
    lastSeenAt: campaign.lastSeenAt,
    rules: campaign.rules.map((rule) => ({
      ...rule,
      categoryNames: names(rule.categoryIds, taxonomy.categoryName),
      merchantNames: names(rule.merchantIds, taxonomy.merchantName),
    })),
  };
}
export type PublicCampaignDetail = NonNullable<Awaited<ReturnType<typeof getPublicCampaign>>>;

/** Sitemap: listede görünen her kampanyanın kanonik adresi ve son değişikliği. */
export async function getSitemapCampaigns(today = turkeyToday()) {
  const campaigns = await getPrisma().campaign.findMany({
    where: activeWhere(today),
    select: { id: true, title: true, updatedAt: true },
    orderBy: { endsAt: "asc" },
  });
  return campaigns.map((campaign) => ({
    path: campaignPath(campaign),
    lastModified: campaign.updatedAt,
  }));
}
