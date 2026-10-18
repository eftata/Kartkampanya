import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

import { securityHeaders } from "./lib/security-headers";

// Ortam değişkenleri monorepo kökündeki .env dosyalarından okunur (zaten tanımlı olanlar ezilmez).
// forceReload: Next zaten apps/web için yükleme yapıp sonucu önbelleğe almış olur.
loadEnvConfig(
  path.resolve(import.meta.dirname, "../.."),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

const nextConfig: NextConfig = {
  // Workspace paketleri derlenmemiş TS kaynağı olarak dışa aktarılır
  transpilePackages: ["@kartplan/shared", "@kartplan/db"],
  cacheComponents: true,
  poweredByHeader: false,
  // Başlıklar build'de belirlenir (APP_URL build ortamından; turbo.json → build.env).
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders({
        dev: process.env.NODE_ENV === "development",
        appUrl: process.env.APP_URL,
      }),
    },
  ],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
