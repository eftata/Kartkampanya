import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { TransactionInput } from "@kartplan/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportUserData } from "./account";
import {
  addTransaction,
  deleteTransaction,
  earliestTransactionDay,
  listTransactions,
  monthSpendSummary,
} from "./transactions";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("harcamalar (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const TODAY = "2026-11-20";
  const ids = {
    bank: "",
    program: "",
    product: "",
    market: "",
    sub: "",
    fuel: "",
    migros: "",
    opet: "",
  };
  let userId = "";
  let otherId = "";
  let cardId = "";
  let otherCardId = "";

  const input = (patch: Partial<TransactionInput> = {}) =>
    TransactionInput.parse({
      userCardId: cardId,
      categoryId: ids.market,
      amountKurus: 45_000,
      date: "2026-11-05",
      ...patch,
    });

  beforeAll(async () => {
    prisma = createPrismaClient();
    ids.bank = (await prisma.bank.create({ data: { name: `Harcama Bankası ${run}` } })).id;
    ids.program = (
      await prisma.program.create({
        data: { bankId: ids.bank, slug: `harcama-${run}`, name: "H", pointName: "P" },
      })
    ).id;
    ids.product = (
      await prisma.cardProduct.create({
        data: { programId: ids.program, name: `Kart ${run}`, type: "CREDIT" },
      })
    ).id;
    ids.market = (
      await prisma.category.create({ data: { slug: `h-m-${run}`, name: `Market ${run}` } })
    ).id;
    ids.sub = (
      await prisma.category.create({
        data: { slug: `h-mo-${run}`, name: "Online", parentId: ids.market },
      })
    ).id;
    ids.fuel = (
      await prisma.category.create({ data: { slug: `h-y-${run}`, name: `Yakıt ${run}` } })
    ).id;
    ids.migros = (
      await prisma.merchant.create({ data: { name: `Migros ${run}`, categoryId: ids.market } })
    ).id;
    ids.opet = (
      await prisma.merchant.create({ data: { name: `Opet ${run}`, categoryId: ids.fuel } })
    ).id;
    userId = (await prisma.user.create({ data: { email: `harcama-${run}@kartplan.test` } })).id;
    otherId = (await prisma.user.create({ data: { email: `harcama2-${run}@kartplan.test` } })).id;
    cardId = (
      await prisma.userCard.create({
        data: { userId, cardProductId: ids.product, nickname: "Ana" },
      })
    ).id;
    otherCardId = (
      await prisma.userCard.create({ data: { userId: otherId, cardProductId: ids.product } })
    ).id;
    await prisma.spendProfile.create({
      data: { userId, categoryId: ids.market, monthlyKurus: 400_000 },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.merchant.deleteMany({ where: { id: { in: [ids.migros, ids.opet] } } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.sub] } } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.market, ids.fuel] } } });
    await prisma.cardProduct.deleteMany({ where: { id: ids.product } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.$disconnect();
  });

  it("ekler, listeler, özetler; profilde olmayan kategori de görünür", async () => {
    expect(await addTransaction(userId, input({ merchantId: ids.migros }), TODAY)).toMatchObject({
      ok: true,
      data: { cardName: "Ana", categoryName: `Market ${run}`, merchantName: `Migros ${run}` },
    });
    await addTransaction(userId, input({ amountKurus: 100_000, date: "2026-11-18" }), TODAY);
    await addTransaction(userId, input({ categoryId: ids.fuel, amountKurus: 70_000 }), TODAY);
    await addTransaction(userId, input({ date: "2026-10-31" }), TODAY); // önceki ay

    const list = await listTransactions(userId, "2026-11");
    expect(list.map((t) => [t.date, t.amountKurus])).toEqual([
      ["2026-11-18", 100_000],
      ["2026-11-05", 70_000],
      ["2026-11-05", 45_000],
    ]);
    expect(await monthSpendSummary(userId, "2026-11")).toEqual([
      {
        categoryId: ids.market,
        categoryName: `Market ${run}`,
        plannedKurus: 400_000,
        spentKurus: 145_000,
      },
      { categoryId: ids.fuel, categoryName: `Yakıt ${run}`, plannedKurus: 0, spentKurus: 70_000 },
    ]);
  });

  it.each([
    ["ileri tarih", { date: "2026-11-21" }, "İleri tarihli"],
    ["90 günden eski", { date: "2026-08-21" }, "90 gün"],
    ["alt kategori", { categoryId: "SUB" }, "Kategori bulunamadı"],
    ["başka kategorinin markası", { merchantId: "OPET" }, "bu kategoride değil"],
    ["başkasının kartı", { userCardId: "OTHER" }, "Kart bulunamadı"],
  ])("reddeder: %s", async (_, patch, message) => {
    const resolved = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [
        key,
        value === "SUB"
          ? ids.sub
          : value === "OPET"
            ? ids.opet
            : value === "OTHER"
              ? otherCardId
              : value,
      ]),
    );
    const result = await addTransaction(userId, input(resolved), TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("en eski gün sınırı dahil", () => {
    expect(earliestTransactionDay(TODAY)).toBe("2026-08-23");
  });

  it("silme sahiplikle; veri kopyasında yer alır; kart silinince harcamaları da silinir", async () => {
    const [first] = await listTransactions(userId, "2026-11");
    expect(await deleteTransaction(otherId, first!.id)).toMatchObject({ ok: false });
    expect(await deleteTransaction(userId, first!.id)).toEqual({ ok: true, data: undefined });

    const data = await exportUserData(userId);
    expect(data.transactions.length).toBe(3);
    expect(data.transactions[0]).toMatchObject({ card: "Ana", amountKurus: 45_000 });

    await prisma.userCard.delete({ where: { id: cardId } });
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
  });
});
