import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import type {
  AdminCampaignInput,
  AdminCampaignReview,
  CampaignRuleInput,
  CampaignStatus,
} from "@kartplan/shared";

import { audit, diff } from "@/lib/admin-audit";
import type { Actor } from "@/lib/admin-audit";
import type { MutationResult } from "@/lib/result";

const fail = (code: "not_found" | "conflict", error: string) =>
  ({ ok: false, code, error }) as const;

/** "YYYY-AA-GG" ↔ veritabanındaki UTC gece yarısı (veri hattı da böyle yazar). */
export const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const toDay = (date: Date) => date.toISOString().slice(0, 10);

// ---------- Okuma ----------

/** Onay kuyruğu: varsayılan DRAFT; en yakın bitenler önce (geç kalınmasın). */
export async function getReviewQueue(status: CampaignStatus = "DRAFT", take = 100) {
  const prisma = getPrisma();
  const [campaigns, counts] = await Promise.all([
    prisma.campaign.findMany({
      where: { status },
      orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
      take,
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        confidence: true,
        uncertainFields: true,
        updatedAt: true,
        program: { select: { name: true, bank: { select: { name: true } } } },
        _count: { select: { rules: true } },
      },
    }),
    prisma.campaign.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  return { campaigns, counts: byStatus as Partial<Record<CampaignStatus, number>> };
}
export type ReviewQueue = Awaited<ReturnType<typeof getReviewQueue>>;

export async function getAdminCampaign(id: string) {
  return getPrisma().campaign.findUnique({
    where: { id },
    include: {
      program: {
        include: {
          bank: true,
          cards: { orderBy: { name: "asc" }, select: { id: true, name: true } },
        },
      },
      source: { select: { adapter: true } },
      rules: { orderBy: { id: "asc" } },
      cardScope: { select: { cardProductId: true } },
    },
  });
}
export type AdminCampaign = NonNullable<Awaited<ReturnType<typeof getAdminCampaign>>>;

/** Kural düzenleyicinin seçenekleri: kategoriler ve markaları. */
export async function getRuleOptions() {
  return getPrisma().category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      merchants: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
}
export type RuleOptions = Awaited<ReturnType<typeof getRuleOptions>>;

/** Kayıtlı kuralı form/API biçimine çevirir (id ve kampanya bağı olmadan). */
export function ruleInput(rule: AdminCampaign["rules"][number]): CampaignRuleInput {
  return {
    categoryIds: rule.categoryIds,
    merchantIds: rule.merchantIds,
    thresholdType: rule.thresholdType,
    thresholdKurus: rule.thresholdKurus,
    txnCount: rule.txnCount,
    tierRepeat: rule.tierRepeat,
    rewardType: rule.rewardType,
    rewardKurus: rule.rewardKurus,
    rewardBps: rule.rewardBps,
    capKurus: rule.capKurus,
    exclusions: rule.exclusions,
  };
}

// ---------- Onay / düzenleme ----------

type Tx = Prisma.TransactionClient;

/** Seçilen kart, kategori ve markalar gerçekten var mı; kartlar kampanyanın programında mı? */
async function checkReferences(
  tx: Tx,
  programId: string,
  input: AdminCampaignInput,
): Promise<string | null> {
  const categoryIds = [...new Set(input.rules.flatMap((rule) => rule.categoryIds))];
  const merchantIds = [...new Set(input.rules.flatMap((rule) => rule.merchantIds))];
  const [cards, categories, merchants] = await Promise.all([
    tx.cardProduct.count({ where: { id: { in: input.cardIds }, programId } }),
    tx.category.count({ where: { id: { in: categoryIds } } }),
    tx.merchant.count({ where: { id: { in: merchantIds } } }),
  ]);
  if (cards !== input.cardIds.length) return "Seçilen kartlardan biri bu programa ait değil.";
  if (categories !== categoryIds.length) return "Seçilen kategorilerden biri artık yok.";
  if (merchants !== merchantIds.length) return "Seçilen markalardan biri artık yok.";
  return null;
}

/**
 * Kaydet (durum değişmez), kaydet ve onayla (APPROVED), reddet (REJECTED). Kurallar ve kart kapsamı
 * bütünüyle değiştirilir. Her işlem aynı transaction içinde `AdminAuditLog`'a yazılır.
 */
export async function reviewCampaign(
  actor: Actor,
  id: string,
  review: AdminCampaignReview,
  now = new Date(),
): Promise<MutationResult<{ status: CampaignStatus }>> {
  return getPrisma().$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id },
      include: { rules: { orderBy: { id: "asc" } }, cardScope: true },
    });
    if (!campaign) return fail("not_found", "Kampanya bulunamadı.");

    if (review.action === "reject") {
      await tx.campaign.update({ where: { id }, data: { status: "REJECTED" } });
      await audit(tx, actor, "campaign.reject", "Campaign", id, {
        status: { from: campaign.status, to: "REJECTED" },
        ...(review.reason ? { reason: review.reason } : {}),
      });
      return { ok: true, data: { status: "REJECTED" } };
    }

    const input = review.campaign;
    if (review.action === "approve" && input.endsAt < toDay(now)) {
      return fail("conflict", "Bitiş tarihi geçmiş kampanya onaylanamaz.");
    }
    const invalid = await checkReferences(tx, campaign.programId, input);
    if (invalid) return fail("conflict", invalid);

    const status: CampaignStatus = review.action === "approve" ? "APPROVED" : campaign.status;
    const fields = {
      title: input.title,
      summary: input.summary,
      startsAt: toDate(input.startsAt),
      endsAt: toDate(input.endsAt),
      joinMethod: input.joinMethod,
      joinDeadline: input.joinDeadline ? toDate(input.joinDeadline) : null,
      status,
    };
    await tx.campaign.update({ where: { id }, data: fields });
    await tx.campaignRule.deleteMany({ where: { campaignId: id } });
    await tx.campaignRule.createMany({
      data: input.rules.map((rule) => ({ ...rule, campaignId: id })),
    });
    await tx.campaignCard.deleteMany({ where: { campaignId: id } });
    await tx.campaignCard.createMany({
      data: input.cardIds.map((cardProductId) => ({ campaignId: id, cardProductId })),
    });

    const changes: Record<string, unknown> = diff(
      {
        title: campaign.title,
        summary: campaign.summary.join(" | "),
        startsAt: toDay(campaign.startsAt),
        endsAt: toDay(campaign.endsAt),
        joinMethod: campaign.joinMethod,
        joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : null,
        status: campaign.status,
      },
      {
        title: input.title,
        summary: input.summary.join(" | "),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        joinMethod: input.joinMethod,
        joinDeadline: input.joinDeadline,
        status,
      },
    );
    const rulesBefore = campaign.rules.map(ruleInput);
    if (JSON.stringify(rulesBefore) !== JSON.stringify(input.rules)) {
      changes.rules = { from: rulesBefore, to: input.rules };
    }
    const cardsBefore = campaign.cardScope.map((card) => card.cardProductId).sort();
    if (JSON.stringify(cardsBefore) !== JSON.stringify([...input.cardIds].sort())) {
      changes.cardIds = { from: cardsBefore, to: input.cardIds };
    }
    await audit(
      tx,
      actor,
      review.action === "approve" ? "campaign.approve" : "campaign.update",
      "Campaign",
      id,
      changes,
    );
    return { ok: true, data: { status } };
  });
}
