"use server";

import { AdminCampaignReview } from "@kartplan/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/admin-catalog-actions";
import { reviewCampaign } from "@/lib/admin-campaigns";
import { requireAdmin } from "@/lib/auth/session";
import { draftToInput } from "@/lib/campaign-draft";
import type { CampaignDraft } from "@/lib/campaign-draft";

async function submit(id: string, review: unknown): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = AdminCampaignReview.safeParse(review);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  const result = await reviewCampaign({ id: user.id, email: user.email }, id, parsed.data);
  if (!result.ok) return { error: result.error };
  // Onay ve ret kuyruğa döner (sıradaki kampanya); kaydet sayfada kalır.
  if (parsed.data.action !== "save") redirect("/admin/kampanyalar");
  refresh();
  return { ok: true };
}

/** Kaydet (durum değişmez) ya da kaydet ve onayla. */
export async function saveCampaignAction(
  id: string,
  action: "save" | "approve",
  draft: CampaignDraft,
): Promise<ActionResult> {
  await requireAdmin();
  const input = draftToInput(draft);
  if (!input.ok) return { error: input.error };
  return submit(id, { action, campaign: input.data });
}

export async function rejectCampaignAction(id: string, reason: string): Promise<ActionResult> {
  return submit(id, { action: "reject", ...(reason.trim() ? { reason } : {}) });
}
