import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getSpendCategories,
  getSpendProfile,
  hasSpendProfile,
  saveSpendProfile,
} from "./spend-profile";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("harcama profili (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { food: "", fuel: "", child: "", foodShop: "", fuelShop: "", alice: "", bob: "" };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const food = await prisma.category.create({
      data: { slug: `gida-${run}`, name: `Gıda ${run}` },
    });
    const fuel = await prisma.category.create({
      data: { slug: `yakit-${run}`, name: `Yakıt ${run}` },
    });
    const child = await prisma.category.create({
      data: { slug: `alt-${run}`, name: `Alt ${run}`, parentId: food.id },
    });
    const foodShop = await prisma.merchant.create({
      data: { name: `Bakkal ${run}`, categoryId: food.id },
    });
    const fuelShop = await prisma.merchant.create({
      data: { name: `İstasyon ${run}`, categoryId: fuel.id },
    });
    const [alice, bob] = await Promise.all(
      ["alice", "bob"].map((n) =>
        prisma.user.create({ data: { email: `${n}-sp-${run}@kartplan.test` } }),
      ),
    );
    Object.assign(ids, {
      food: food.id,
      fuel: fuel.id,
      child: child.id,
      foodShop: foodShop.id,
      fuelShop: fuelShop.id,
      alice: alice!.id,
      bob: bob!.id,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ids.alice, ids.bob] } } });
    await prisma.merchant.deleteMany({ where: { id: { in: [ids.foodShop, ids.fuelShop] } } });
    await prisma.category.deleteMany({ where: { id: ids.child } });
    await prisma.category.deleteMany({ where: { id: { in: [ids.food, ids.fuel] } } });
    await prisma.$disconnect();
  });

  it("yalnızca ana kategorileri markalarıyla listeler", async () => {
    const categories = await getSpendCategories();
    const food = categories.find((c) => c.id === ids.food);
    expect(food?.merchants).toEqual([{ id: ids.foodShop, name: `Bakkal ${run}` }]);
    expect(categories.some((c) => c.id === ids.child)).toBe(false);
  });

  it("profili kaydeder, toplamı hesaplar ve boş profili ayırt eder", async () => {
    expect(await hasSpendProfile(ids.alice)).toBe(false);
    const result = await saveSpendProfile(ids.alice, {
      items: [
        { categoryId: ids.food, monthlyKurus: 600_000, merchantIds: [ids.foodShop] },
        { categoryId: ids.fuel, monthlyKurus: 300_000, merchantIds: [] },
      ],
    });
    expect(result.ok && result.data.totalKurus).toBe(900_000);
    expect(await hasSpendProfile(ids.alice)).toBe(true);
  });

  it("profili bütünüyle değiştirir: çıkarılan kategori silinir, kalan güncellenir", async () => {
    await saveSpendProfile(ids.alice, {
      items: [{ categoryId: ids.fuel, monthlyKurus: 450_000, merchantIds: [ids.fuelShop] }],
    });
    const profile = await getSpendProfile(ids.alice);
    expect(profile.items).toEqual([
      {
        categoryId: ids.fuel,
        categorySlug: `yakit-${run}`,
        categoryName: `Yakıt ${run}`,
        monthlyKurus: 450_000,
        merchantIds: [ids.fuelShop],
      },
    ]);
    expect(profile.totalKurus).toBe(450_000);
  });

  it("başka kategorinin markasını ve olmayan kategoriyi reddeder, profili bozmaz", async () => {
    expect(
      await saveSpendProfile(ids.alice, {
        items: [{ categoryId: ids.fuel, monthlyKurus: 100_000, merchantIds: [ids.foodShop] }],
      }),
    ).toMatchObject({ ok: false, code: "not_found", error: "Seçilen marka bu kategoride değil." });
    expect(
      await saveSpendProfile(ids.alice, {
        items: [{ categoryId: "yok", monthlyKurus: 100_000, merchantIds: [] }],
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect((await getSpendProfile(ids.alice)).totalKurus).toBe(450_000);
  });

  it("kullanıcıların profilleri birbirinden bağımsızdır", async () => {
    await saveSpendProfile(ids.bob, {
      items: [{ categoryId: ids.food, monthlyKurus: 200_000, merchantIds: [] }],
    });
    expect((await getSpendProfile(ids.alice)).totalKurus).toBe(450_000);
    expect((await getSpendProfile(ids.bob)).totalKurus).toBe(200_000);
  });
});
