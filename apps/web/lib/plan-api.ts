import "server-only";

import type { MonthlyPlanDto } from "@kartplan/shared";

import { jsonError } from "@/lib/api";
import type { PlanResult } from "@/lib/plan";

/** Planın API biçimi; hesaplanamadıysa uygun HTTP yanıtı (409 eksik veri, 503 motor). */
export function planResponse(result: PlanResult): Response {
  if (result.status === "incomplete") {
    return jsonError(409, "Önce kartlarını ve harcama profilini ekle.");
  }
  if (result.status === "error") return jsonError(503, result.error);
  const { month, plan, computedAt, stale } = result.view;
  return Response.json({
    month,
    plan,
    computedAt: computedAt.toISOString(),
    stale,
  } satisfies MonthlyPlanDto);
}
