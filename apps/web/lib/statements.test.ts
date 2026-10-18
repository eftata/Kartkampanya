import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import type { StatementImportInput, StatementParseResult } from "@kartplan/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { importStatementRows, reviewStatement } from "./statements";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("ekstre içe aktarma (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const TODAY = "2026-11-20";
  const ids = { bank: "", program: "", product: "", market: "", sub: "", merchant: "" };
  let userId = "";
  let otherId = "";
  let cardId = "";

  const parsed = (rows: StatementParseResult["rows"]): StatementParseResult => ({
    parser: "genel",
    pages: 1,
    rows,
    skippedCredits: 1,
    unparsedLines: 0,
  });

  beforeAll(async () => {
    prisma = createPrismaClient();
    ids.bank = (await prisma.bank.create({ data: { name: `Ekstre Bankası ${run}` } })).id;
    ids.program = (
      await prisma.program.create({
        data: { bankId: ids.bank, slug: `ekstre-${run}`, name: "E", pointName: "P" },
      })
    ).id;
    ids.product = (
      await prisma.cardProduct.create({
        data: { programId: ids.program, name: `Kart ${run}`, type: "CREDIT" },
      })
    ).id;
    ids.market = (
      await prisma.category.create({ data: { slug: `e-m-${run}`, name: `Market ${run}` } })
    ).id;
    ids.sub = (
      await prisma.category.create({
        data: { slug: `e-mo-${run}`, name: "Alt", parentId: ids.market },
      })
    ).id;
    // Alt kategorideki marka: önerilen kategori ana kategori olmalı.
    ids.merchant = (
      await prisma.merchant.create({ data: { name: `Zincir${run}`, categoryId: ids.sub } })
    ).id;
    userId = (await prisma.user.create({ data: { email: `ekstre-${run}@kartplan.test` } })).id;
    otherId = (await prisma.user.create({ data: { email: `ekstre2-${run}@kartplan.test` } })).id;
    cardId = (await prisma.userCard.create({ data: { userId, cardProductId: ids.product } })).id;
    await prisma.transaction.create({
      data: {
        userId,
        userCardId: cardId,
        categoryId: ids.market,
        amountKurus: 45_000,
        date: new Date("2026-11-05T00:00:00Z"),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.merchant.deleteMany({ where: { id: ids.merchant } });
    await prisma.category.deleteMany({ where: { id: ids.sub } });
    await prisma.category.deleteMany({ where: { id: ids.market } });
    await prisma.cardProduct.deleteMany({ where: { id: ids.product } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.$disconnect();
  });

  it("öneri, mükerrer ve tarih aralığı", async () => {
    const result = await reviewStatement(
      userId,
      cardId,
      parsed([
        { date: "2026-11-05", description: "MARKET X", amountKurus: 45_000, installment: null },
        {
          date: "2026-11-06",
          description: `ZINCIR${run.toUpperCase()} KADIKOY`,
          amountKurus: 12_000,
          installment: null,
        },
        { date: "2026-01-02", description: "ESKI", amountKurus: 1_000, installment: null },
      ]),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows.map((row) => [row.duplicate, row.outOfRange, row.categoryId])).toEqual([
      [true, false, null],
      [false, false, ids.market],
      [false, true, null],
    ]);
    expect(result.data.rows[1]?.merchantId).toBe(ids.merchant);
    expect(await reviewStatement(otherId, cardId, parsed([]), TODAY)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("onaylanan satırlar ekstre kaynağıyla eklenir; geçersiz istek reddedilir", async () => {
    const row = {
      date: "2026-11-06",
      amountKurus: 12_000,
      categoryId: ids.market,
      merchantId: ids.merchant,
    };
    expect(await importStatementRows(userId, { userCardId: cardId, rows: [row] }, TODAY)).toEqual({
      ok: true,
      data: { imported: 1 },
    });
    const saved = await prisma.transaction.findFirstOrThrow({
      where: { userId, amountKurus: 12_000 },
    });
    expect(saved).toMatchObject({ source: "STATEMENT", merchantId: ids.merchant });

    const cases: [StatementImportInput, string][] = [
      [{ userCardId: cardId, rows: [{ ...row, date: "2026-12-01" }] }, "90 günün dışında"],
      [{ userCardId: cardId, rows: [{ ...row, categoryId: ids.sub }] }, "kategorilerden biri"],
      [{ userCardId: "yok", rows: [row] }, "Kart bulunamadı"],
    ];
    for (const [input, message] of cases) {
      const result = await importStatementRows(userId, input, TODAY);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(message);
    }
  });
});
