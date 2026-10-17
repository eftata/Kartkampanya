import "server-only";

import { getPrisma } from "@kartplan/db";
import type { CampaignStatusDto, CampaignStatusInput } from "@kartplan/shared";

import type { MutationResult } from "@/lib/result";

/**
 * "Katıldım" / plana dahil işaretleri (`UserCampaignStatus`). Yalnızca kullanıcıya görünebilen
 * kampanyalar işaretlenir (onaylı ya da süresi dolmuş); taslak ve reddedilenler "bulunamadı" döner
 * (varlıkları sızmaz). Satır ilk işarette oluşur; `joinedAt` katılım işaretlendiği an.
 */
export async function setCampaignStatus(
  userId: string,
  campaignId: string,
  input: CampaignStatusInput,
): Promise<MutationResult<CampaignStatusDto>> {
  const prisma = getPrisma();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, status: { in: ["APPROVED", "EXPIRED"] } },
    select: { id: true, userStatus: { where: { userId }, select: { joined: true } } },
  });
  if (!campaign) return { ok: false, code: "not_found", error: "Kampanya bulunamadı." };

  const wasJoined = campaign.userStatus[0]?.joined ?? false;
  const joinedAt =
    input.joined === undefined
      ? undefined
      : input.joined
        ? wasJoined
          ? undefined
          : new Date()
        : null;
  const data = {
    ...(input.joined !== undefined ? { joined: input.joined } : {}),
    ...(joinedAt !== undefined ? { joinedAt } : {}),
    ...(input.inPlan !== undefined ? { inPlan: input.inPlan } : {}),
  };
  const status = await prisma.userCampaignStatus.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: { userId, campaignId, ...data },
    update: data,
    select: { joined: true, inPlan: true },
  });
  return { ok: true, data: status };
}
