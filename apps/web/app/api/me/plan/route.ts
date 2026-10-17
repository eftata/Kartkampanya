import { PlanMonth } from "@kartplan/shared";
import type { MonthlyPlanDto } from "@kartplan/shared";

import { jsonError, withUser } from "@/lib/api";
import { turkeyToday } from "@/lib/campaign-match";
import { getMonthlyPlan, getStoredPlan } from "@/lib/plan";
import { planResponse } from "@/lib/plan-api";

/** Bu ayın planı (kayıtlıysa ondan, veri değiştiyse yeniden hesaplanır); başka ay: yalnız kayıtlı. */
export function GET(request: Request) {
  return withUser(async (user) => {
    const current = turkeyToday().slice(0, 7);
    const month = PlanMonth.safeParse(new URL(request.url).searchParams.get("month") ?? current);
    if (!month.success) return jsonError(400, month.error.issues[0]?.message ?? "Geçersiz ay.");
    if (month.data === current) return planResponse(await getMonthlyPlan(user.id));
    const stored = await getStoredPlan(user.id, month.data);
    if (!stored) return jsonError(404, "Bu ay için kayıtlı plan yok.");
    return Response.json({
      ...stored,
      computedAt: stored.computedAt.toISOString(),
      stale: false,
    } satisfies MonthlyPlanDto);
  });
}
