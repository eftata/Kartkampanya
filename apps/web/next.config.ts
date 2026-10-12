import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/shared derlenmemiş TS kaynağı olarak dışa aktarılır
  transpilePackages: ["@kartplan/shared"],
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
