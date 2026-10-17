import { MyCampaignsQuery } from "@kartplan/shared";

import { jsonError, withUser } from "@/lib/api";
import { getMyCampaigns } from "@/lib/campaigns";

/** Kişiye eşleşen aktif kampanyalar: `?card=&category=&type=&sort=ends|gain`. */
export function GET(request: Request) {
  return withUser(async (user) => {
    const params = Object.fromEntries(
      [...new URL(request.url).searchParams].filter(([, value]) => value !== ""),
    );
    const query = MyCampaignsQuery.safeParse(params);
    if (!query.success) return jsonError(400, query.error.issues[0]?.message ?? "Geçersiz istek.");
    return Response.json({ campaigns: await getMyCampaigns(user.id, query.data) });
  });
}
