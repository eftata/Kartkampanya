import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCatalogBanks } from "./catalog";
import {
  addUserCard,
  countUserCards,
  listUserCards,
  removeUserCard,
  updateUserCard,
} from "./user-cards";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("kullanıcı kartları ve katalog (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", emptyBank: "", program: "", cardA: "", cardB: "", alice: "", bob: "" };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `ZZ Test Bankası ${run}` } });
    const emptyBank = await prisma.bank.create({ data: { name: `ZZ Kartsız Banka ${run}` } });
    const program = await prisma.program.create({
      data: { bankId: bank.id, slug: `t-${run}`, name: "Testpuan", pointName: "TP" },
    });
    const [cardA, cardB] = await Promise.all(
      ["A Kart", "B Kart"].map((name) =>
        prisma.cardProduct.create({ data: { programId: program.id, name, type: "CREDIT" } }),
      ),
    );
    const [alice, bob] = await Promise.all(
      ["alice", "bob"].map((n) =>
        prisma.user.create({ data: { email: `${n}-${run}@kartplan.test` } }),
      ),
    );
    Object.assign(ids, {
      bank: bank.id,
      emptyBank: emptyBank.id,
      program: program.id,
      cardA: cardA!.id,
      cardB: cardB!.id,
      alice: alice!.id,
      bob: bob!.id,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ids.alice, ids.bob] } } });
    await prisma.cardProduct.deleteMany({ where: { programId: ids.program } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: { in: [ids.bank, ids.emptyBank] } } });
    await prisma.$disconnect();
  });

  it("katalog ağacı kartsız bankaları göstermez", async () => {
    const banks = await getCatalogBanks();
    const bank = banks.find((b) => b.id === ids.bank);
    expect(bank?.programs[0]?.cards.map((c) => c.name)).toEqual(["A Kart", "B Kart"]);
    expect(banks.some((b) => b.id === ids.emptyBank)).toBe(false);
  });

  it("kart ekler ve banka/program bilgisiyle listeler", async () => {
    const result = await addUserCard(ids.alice, {
      cardProductId: ids.cardA,
      nickname: "Maaş kartım",
      limitKurus: 5_000_000,
      statementDay: 15,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        cardName: "A Kart",
        programName: "Testpuan",
        bankName: `ZZ Test Bankası ${run}`,
        nickname: "Maaş kartım",
        limitKurus: 5_000_000,
        statementDay: 15,
      },
    });
    await addUserCard(ids.alice, { cardProductId: ids.cardB });
    const cards = await listUserCards(ids.alice);
    expect(cards.map((c) => [c.cardName, c.nickname, c.limitKurus])).toEqual([
      ["A Kart", "Maaş kartım", 5_000_000],
      ["B Kart", null, null],
    ]);
    expect(await countUserCards(ids.alice)).toBe(2);
  });

  it("aynı kartı ikinci kez eklemez", async () => {
    expect(await addUserCard(ids.alice, { cardProductId: ids.cardA })).toEqual({
      ok: false,
      code: "conflict",
      error: "Bu kart zaten ekli.",
    });
  });

  it("katalogda olmayan kartı reddeder", async () => {
    expect(await addUserCard(ids.alice, { cardProductId: "olmayan" })).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("ayrıntıları günceller, null ile temizler, gönderilmeyen alana dokunmaz", async () => {
    const [card] = await listUserCards(ids.alice);
    const updated = await updateUserCard(ids.alice, card!.id, { limitKurus: 7_500_000 });
    expect(updated).toMatchObject({
      ok: true,
      data: { nickname: "Maaş kartım", limitKurus: 7_500_000, statementDay: 15 },
    });
    const cleared = await updateUserCard(ids.alice, card!.id, {
      nickname: null,
      statementDay: null,
    });
    expect(cleared).toMatchObject({
      ok: true,
      data: { nickname: null, limitKurus: 7_500_000, statementDay: null },
    });
  });

  it("başka kullanıcının kartını güncelleyemez", async () => {
    const [card] = await listUserCards(ids.alice);
    expect(await updateUserCard(ids.bob, card!.id, { limitKurus: 1 })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect((await listUserCards(ids.alice))[0]?.limitKurus).toBe(7_500_000);
  });

  it("başka kullanıcının kartını silemez", async () => {
    const [aliceCard] = await listUserCards(ids.alice);
    expect(await removeUserCard(ids.bob, aliceCard!.id)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await countUserCards(ids.alice)).toBe(2);
    expect(await removeUserCard(ids.alice, aliceCard!.id)).toEqual({ ok: true, data: undefined });
    expect(await countUserCards(ids.alice)).toBe(1);
  });
});
