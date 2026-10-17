"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getMonthlyPlan } from "@/lib/plan";

/** "Yeniden hesapla": veri değişmemiş olsa da planı motora yeniden hesaplatır. */
export async function recomputePlanAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const result = await getMonthlyPlan(user.id, { force: true });
  if (result.status === "error") return { ok: false, error: result.error };
  if (result.status === "ok" && result.view.stale) {
    return { ok: false, error: "Plan servisine ulaşılamadı; son plan gösteriliyor." };
  }
  refresh();
  return { ok: true };
}
