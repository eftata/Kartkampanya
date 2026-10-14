import type { PrismaClient } from "../src/generated/prisma/client";

import { CATEGORIES, PROGRAMS, UNVERIFIED_BASE_RATE_BPS } from "./seed-data/catalog";

export type CatalogSeedResult = {
  banks: number;
  programs: number;
  cards: number;
  categories: number;
  merchants: number;
};

/**
 * Kataloğu yalnızca EKSİK kayıtları oluşturarak doldurur (upsert, `update: {}`).
 * Admin'in düzelttiği veya doğruladığı kayıtlar tekrar çalıştırmada asla ezilmez.
 */
export async function seedCatalog(prisma: PrismaClient): Promise<CatalogSeedResult> {
  for (const program of PROGRAMS) {
    const bank = await prisma.bank.upsert({
      where: { name: program.bank },
      update: {},
      create: { name: program.bank },
    });
    const saved = await prisma.program.upsert({
      where: { slug: program.slug },
      update: {},
      create: {
        bankId: bank.id,
        slug: program.slug,
        name: program.name,
        pointName: program.pointName,
        pointValueTL: program.pointValueTL,
        pointValueVerifiedAt: null,
      },
    });
    for (const card of program.cards) {
      await prisma.cardProduct.upsert({
        where: { programId_name: { programId: saved.id, name: card.name } },
        update: {},
        create: {
          programId: saved.id,
          name: card.name,
          type: card.type,
          baseRateBps: UNVERIFIED_BASE_RATE_BPS,
          ratesVerifiedAt: null,
        },
      });
    }
  }

  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { slug: category.slug, name: category.name },
    });
    for (const name of category.merchants) {
      await prisma.merchant.upsert({
        where: { name },
        update: {},
        create: { name, categoryId: saved.id },
      });
    }
  }

  const programSlugs = PROGRAMS.map((p) => p.slug);
  const [banks, programs, cards, categories, merchants] = await Promise.all([
    prisma.bank.count({ where: { name: { in: PROGRAMS.map((p) => p.bank) } } }),
    prisma.program.count({ where: { slug: { in: programSlugs } } }),
    prisma.cardProduct.count({ where: { program: { slug: { in: programSlugs } } } }),
    prisma.category.count({ where: { slug: { in: CATEGORIES.map((c) => c.slug) } } }),
    prisma.merchant.count({ where: { name: { in: CATEGORIES.flatMap((c) => c.merchants) } } }),
  ]);
  return { banks, programs, cards, categories, merchants };
}
