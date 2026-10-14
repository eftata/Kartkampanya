import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL tanımlı değil (.env.example dosyasına bakın).");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next.js geliştirme modunda her hot reload yeni bağlantı havuzu açmasın.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Uygulama genelinde paylaşılan istemci; ilk kullanımda oluşturulur. */
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
