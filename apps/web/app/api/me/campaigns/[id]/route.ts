import { CampaignStatusInput } from "@kartplan/shared";

import { mutationError, parseJson, withUser } from "@/lib/api";
import { setCampaignStatus } from "@/lib/campaign-status";

/** `joined` / `inPlan` işaretleme; yanıt güncel işaretler. */
export function PATCH(request: Request, { params }: RouteContext<"/api/me/campaigns/[id]">) {
  return withUser(async (user) => {
    const input = await parseJson(request, CampaignStatusInput);
    if (!input.ok) return input.response;
    const result = await setCampaignStatus(user.id, (await params).id, input.data);
    return result.ok ? Response.json(result.data) : mutationError(result);
  });
}
