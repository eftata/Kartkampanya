import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalog } from "../prisma/seed-catalog";
import { CATEGORIES, PROGRAMS, UNVERIFIED_BASE_RATE_BPS } from "../prisma/seed-data/catalog";
import { createPrismaClient } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

const unique = (values: string[]) => new Set(values).size === values.length;

describe("seed katalog verisi", () => {
  it("ROADMAP kapsamını karşılar: 5 program, programda 3–5 kart, 6 kategori, 30 marka", () => {
    expect(PROGRAMS).toHaveLength(5);
    for (const program of PROGRAMS) {
      expect(program.cards.length).toBeGreaterThanOrEqual(3);
      expect(program.cards.length).toBeLessThanOrEqual(5);
    }
    expect(CATEGORIES).toHaveLength(6);
    expect(CATEGORIES.flatMap((c) => c.merchants)).toHaveLength(30);
  });

  it("doğal anahtarlar tekildir", () => {
    expect(unique(PROGRAMS.map((p) => p.slug))).toBe(true);
    expect(unique(PROGRAMS.map((p) => p.bank))).toBe(true);
    for (const program of PROGRAMS) expect(unique(program.cards.map((c) => c.name))).toBe(true);
    expect(unique(CATEGORIES.map((c) => c.slug))).toBe(true);
    expect(unique(CATEGORIES.flatMap((c) => c.merchants))).toBe(true);
  });

  it("slug'lar URL ve adaptör adı olarak kullanılabilir", () => {
    for (const slug of [...PROGRAMS.map((p) => p.slug), ...CATEGORIES.map((c) => c.slug)]) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("doğrulanmamış oran kazancı abartmaz", () => {
    expect(UNVERIFIED_BASE_RATE_BPS).toBe(0);
    for (const program of PROGRAMS) expect(Number(program.pointValueTL)).toBeGreaterThan(0);
  });
});

// Gerçek veritabanı gerektirir. Seed verisi geliştirme veritabanında kalır (zaten istenen durum).
describe.skipIf(!process.env.DATABASE_URL)("seedCatalog (veritabanı)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("kataloğu oluşturur ve her şeyi doğrulanmadı olarak işaretler", async () => {
    const result = await seedCatalog(prisma);
    expect(result).toEqual({ banks: 5, programs: 5, cards: 18, categories: 6, merchants: 30 });

    const slugs = PROGRAMS.map((p) => p.slug);
    expect(
      await prisma.program.count({ where: { slug: { in: slugs }, pointValueVerifiedAt: null } }),
    ).toBe(5);
    const cards = await prisma.cardProduct.findMany({
      where: { program: { slug: { in: slugs } } },
      include: { earnRates: true },
    });
    expect(cards.every((c) => c.ratesVerifiedAt === null)).toBe(true);
    expect(cards.every((c) => c.baseRateBps === UNVERIFIED_BASE_RATE_BPS)).toBe(true);
    expect(cards.every((c) => c.earnRates.length === 0)).toBe(true);
  });

  it("tekrar çalıştırmada çoğaltmaz ve admin düzeltmelerini ezmez", async () => {
    await seedCatalog(prisma);
    const card = await prisma.cardProduct.findFirstOrThrow({
      where: { program: { slug: "bonus" }, name: "Bonus Platinum" },
    });
    const verifiedAt = new Date("2026-10-01T00:00:00Z");
    await prisma.cardProduct.update({
      where: { id: card.id },
      data: { baseRateBps: 75, ratesVerifiedAt: verifiedAt },
    });
    try {
      const again = await seedCatalog(prisma);
      expect(again.cards).toBe(18);
      const after = await prisma.cardProduct.findUniqueOrThrow({ where: { id: card.id } });
      expect(after.baseRateBps).toBe(75);
      expect(after.ratesVerifiedAt).toEqual(verifiedAt);
    } finally {
      await prisma.cardProduct.update({
        where: { id: card.id },
        data: { baseRateBps: card.baseRateBps, ratesVerifiedAt: card.ratesVerifiedAt },
      });
    }
  });
});
