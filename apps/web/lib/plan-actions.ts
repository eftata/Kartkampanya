"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getMonthlyPlan } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

/** "Yeniden hesapla": veri değişmemiş olsa da planı motora yeniden hesaplatır. */
export async function recomputePlanAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!(await rateLimit("recompute", user.id)).ok) {
    return { ok: false, error: "Planı kısa sürede çok kez yeniden hesaplattın; biraz sonra dene." };
  }
  const result = await getMonthlyPlan(user.id, { force: true });
  if (result.status === "error") return { ok: false, error: result.error };
  if (result.status === "ok" && result.view.stale) {
    return { ok: false, error: "Plan servisine ulaşılamadı; son plan gösteriliyor." };
  }
  refresh();
  return { ok: true };
}
