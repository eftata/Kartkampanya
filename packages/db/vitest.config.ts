import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  test: {
    // Testler aynı veritabanını paylaşır; dosyalar sırayla çalışsın.
    fileParallelism: false,
  },
});
