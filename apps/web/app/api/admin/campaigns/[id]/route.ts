import { AdminCampaignReview } from "@kartplan/shared";

import { reviewCampaign } from "@/lib/admin-campaigns";
import { mutationError, parseJson, withAdmin } from "@/lib/api";

/** Kural düzenle (`save`), onayla (`approve`) ya da reddet (`reject`). */
export function PUT(request: Request, { params }: RouteContext<"/api/admin/campaigns/[id]">) {
  return withAdmin(async (user) => {
    const input = await parseJson(request, AdminCampaignReview);
    if (!input.ok) return input.response;
    const result = await reviewCampaign(user, (await params).id, input.data);
    return result.ok ? Response.json(result.data) : mutationError(result);
  });
}
