import { CampaignStatus } from "@kartplan/shared";

import { getReviewQueue } from "@/lib/admin-campaigns";
import { jsonError, withAdmin } from "@/lib/api";

/** Onay kuyruğu; `?status=APPROVED|REJECTED|EXPIRED` ile diğer durumlar (varsayılan DRAFT). */
export function GET(request: Request) {
  return withAdmin(async () => {
    const raw = new URL(request.url).searchParams.get("status") ?? "DRAFT";
    const status = CampaignStatus.safeParse(raw);
    if (!status.success) return jsonError(400, "Geçersiz durum.");
    return Response.json(await getReviewQueue(status.data));
  });
}
