import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createBank,
  createCard,
  createProgram,
  deleteBank,
  deleteCard,
  deleteProgram,
  getAuditLog,
  updateBank,
  updateCard,
  updateProgram,
} from "./admin-catalog";
import type { Actor } from "./admin-catalog";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("admin katalog (veritabanı)", () => {
  let prisma: PrismaClient;
  let actor: Actor;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", program: "", card: "", fuel: "", market: "", user: "" };

  const ok = <T>(result: { ok: true; data: T } | { ok: false; error: string }): T => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const admin = await prisma.user.create({
      data: { email: `admin-${run}@kartplan.test`, role: "ADMIN" },
    });
    actor = { id: admin.id, email: admin.email };
    const [fuel, market] = await Promise.all(
      ["yakit", "gida"].map((slug) =>
        prisma.category.create({ data: { slug: `${slug}-adm-${run}`, name: `${slug} ${run}` } }),
      ),
    );
    const user = await prisma.user.create({ data: { email: `kullanici-${run}@kartplan.test` } });
    Object.assign(ids, { fuel: fuel!.id, market: market!.id, user: user.id });
  });

  afterAll(async () => {
    await prisma.userCard.deleteMany({ where: { userId: ids.user } });
    await prisma.cardProduct.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.fuel, ids.market] } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: actor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, ids.user] } } });
    await prisma.$disconnect();
  });

  it("banka → program → kart oluşturur, çakışmaları Türkçe hatayla döner", async () => {
    ids.bank = ok(await createBank(actor, { name: `Admin Bankası ${run}` })).id;
    expect(await createBank(actor, { name: `Admin Bankası ${run}` })).toMatchObject({
      ok: false,
      code: "conflict",
    });
    ids.program = ok(
      await createProgram(actor, {
        bankId: ids.bank,
        slug: `adm-${run}`,
        name: "Adminpuan",
        pointName: "AP",
        pointValueTL: "0.5",
        pointValueVerified: false,
      }),
    ).id;
    ids.card = ok(
      await createCard(actor, {
        programId: ids.program,
        name: "Admin Platinum",
        type: "CREDIT",
        annualFee: null,
        baseRateBps: 0,
        ratesVerified: false,
      }),
    ).id;
    expect(
      await createCard(actor, {
        programId: ids.program,
        name: "Admin Platinum",
        type: "CREDIT",
        annualFee: null,
        baseRateBps: 0,
        ratesVerified: false,
      }),
    ).toMatchObject({ ok: false, code: "conflict" });
  });

  it("oranları doğrular, kategori oranlarını değiştirir ve işlem kaydına yazar", async () => {
    ok(
      await updateCard(actor, ids.card, {
        baseRateBps: 50,
        rates: [{ categoryId: ids.fuel, rateBps: 100 }],
        ratesVerified: true,
      }),
    );
    const card = await prisma.cardProduct.findUniqueOrThrow({
      where: { id: ids.card },
      include: { earnRates: true },
    });
    expect(card.baseRateBps).toBe(50);
    expect(card.ratesVerifiedAt).toBeInstanceOf(Date);
    expect(card.earnRates.map((r) => [r.categoryId, r.rateBps])).toEqual([[ids.fuel, 100]]);

    const [entry] = await getAuditLog({ entityType: "CardProduct", entityId: ids.card }, 1);
    expect(entry).toMatchObject({ action: "card.verify_rates", actorEmail: actor.email });
    expect(entry?.data).toMatchObject({ baseRateBps: { from: 0, to: 50 } });
  });

  it("oran değiştiği halde doğrulama gönderilmezse doğrulama kalkar", async () => {
    ok(await updateCard(actor, ids.card, { rates: [{ categoryId: ids.market, rateBps: 75 }] }));
    const card = await prisma.cardProduct.findUniqueOrThrow({
      where: { id: ids.card },
      include: { earnRates: true },
    });
    expect(card.ratesVerifiedAt).toBeNull();
    expect(card.earnRates.map((r) => r.categoryId)).toEqual([ids.market]);
  });

  it("oran dışı değişiklik (ad) doğrulamaya dokunmaz", async () => {
    ok(await updateCard(actor, ids.card, { ratesVerified: true }));
    const verifiedAt = (await prisma.cardProduct.findUniqueOrThrow({ where: { id: ids.card } }))
      .ratesVerifiedAt;
    ok(await updateCard(actor, ids.card, { name: "Admin Platinum Plus" }));
    ok(await updateCard(actor, ids.card, { baseRateBps: 50, ratesVerified: true }));
    const after = await prisma.cardProduct.findUniqueOrThrow({ where: { id: ids.card } });
    expect(after.name).toBe("Admin Platinum Plus");
    expect(after.ratesVerifiedAt).toEqual(verifiedAt);
  });

  it("puan değeri doğrulaması aynı kuralla çalışır", async () => {
    ok(await updateProgram(actor, ids.program, { pointValueVerified: true }));
    let program = await prisma.program.findUniqueOrThrow({ where: { id: ids.program } });
    expect(program.pointValueVerifiedAt).toBeInstanceOf(Date);
    ok(await updateProgram(actor, ids.program, { pointValueTL: "1" }));
    program = await prisma.program.findUniqueOrThrow({ where: { id: ids.program } });
    expect(program.pointValueTL.toString()).toBe("1");
    expect(program.pointValueVerifiedAt).toBeNull();
  });

  it("kullanılan kart ve dolu program/banka silinemez", async () => {
    await prisma.userCard.create({ data: { userId: ids.user, cardProductId: ids.card } });
    expect(await deleteCard(actor, ids.card)).toMatchObject({
      ok: false,
      code: "conflict",
      error: "Bu kartı 1 kullanıcı seçmiş; silinemez.",
    });
    expect(await deleteProgram(actor, ids.program)).toMatchObject({ ok: false, code: "conflict" });
    expect(await deleteBank(actor, ids.bank)).toMatchObject({ ok: false, code: "conflict" });

    await prisma.userCard.deleteMany({ where: { userId: ids.user } });
    ok(await deleteCard(actor, ids.card));
    ok(await deleteProgram(actor, ids.program));
    ok(await updateBank(actor, ids.bank, { name: `Admin Bankası 2 ${run}` }));
    ok(await deleteBank(actor, ids.bank));
    expect(await prisma.bank.findUnique({ where: { id: ids.bank } })).toBeNull();
  });

  it("her işlem kayıt altındadır", async () => {
    const actions = (await prisma.adminAuditLog.findMany({ where: { actorId: actor.id } })).map(
      (e) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "bank.create",
        "program.create",
        "card.create",
        "card.verify_rates",
        "card.update",
        "program.verify_point_value",
        "program.update",
        "card.delete",
        "program.delete",
        "bank.update",
        "bank.delete",
      ]),
    );
  });
});
