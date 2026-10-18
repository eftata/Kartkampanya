import { withUser } from "@/lib/api";
import { getMonthlyPlan } from "@/lib/plan";
import { planResponse } from "@/lib/plan-api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Bu ayın planını veri değişmemiş olsa da yeniden hesaplar (kullanıcı başına saatlik sınır). */
export function POST() {
  return withUser(async (user) => {
    const limit = await rateLimit("recompute", user.id);
    if (!limit.ok) return tooManyRequests(limit);
    return planResponse(await getMonthlyPlan(user.id, { force: true }));
  });
}
