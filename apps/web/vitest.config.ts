import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      "server-only": path.resolve(import.meta.dirname, "test/server-only.ts"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    // DB testleri aynı veritabanını paylaşır.
    fileParallelism: false,
  },
});
