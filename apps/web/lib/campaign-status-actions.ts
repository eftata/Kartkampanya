"use server";

import { CampaignStatusInput } from "@kartplan/shared";
import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { setCampaignStatus } from "@/lib/campaign-status";

export type JoinResult = { ok: true; joined: boolean } | { ok: false; error: string };

/** Kampanyalar sayfasındaki "Katıldım" düğmesi. */
export async function setJoinedAction(campaignId: string, joined: boolean): Promise<JoinResult> {
  const user = await requireUser();
  const input = CampaignStatusInput.safeParse({ joined });
  if (!input.success) return { ok: false, error: "Geçersiz istek." };
  const result = await setCampaignStatus(user.id, campaignId, input.data);
  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return { ok: true, joined: result.data.joined };
}
