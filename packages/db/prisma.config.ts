import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Ortam değişkenleri repo kökündeki .env dosyasından okunur (CI'da doğrudan ortamdan gelir).
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // `prisma generate` veritabanı adresi olmadan da çalışabilsin diye env() yerine process.env.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
