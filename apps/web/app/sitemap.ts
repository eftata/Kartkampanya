import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getSitemapCampaigns } from "@/lib/public-campaigns";
import { siteUrl } from "@/lib/site";

/** Herkese açık sayfalar + listede görünen kampanyalar (ADR 0020). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Veritabanı build'de okunmaz (CI build'inin veritabanı yok); her istekte güncel liste.
  await connection();
  const base = siteUrl();
  const campaigns = await getSitemapCampaigns();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/kampanyalar`, changeFrequency: "daily", priority: 0.9 },
    ...campaigns.map((campaign) => ({
      url: `${base}${campaign.path}`,
      lastModified: campaign.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${base}/aydinlatma`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
