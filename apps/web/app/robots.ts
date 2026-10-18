import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { NON_INDEXED_PATHS, siteUrl } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Adres çalışma anında okunur (build ortamında APP_URL olmayabilir).
  await connection();
  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...NON_INDEXED_PATHS] },
    sitemap: `${base}/sitemap.xml`,
  };
}
