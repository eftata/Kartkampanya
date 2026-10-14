import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

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
