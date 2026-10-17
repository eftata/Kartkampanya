import { withUser } from "@/lib/api";
import { getMonthlyPlan } from "@/lib/plan";
import { planResponse } from "@/lib/plan-api";

/** Bu ayın planını veri değişmemiş olsa da yeniden hesaplar. */
export function POST() {
  return withUser(async (user) => planResponse(await getMonthlyPlan(user.id, { force: true })));
}
