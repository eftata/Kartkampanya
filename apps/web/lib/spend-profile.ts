import "server-only";

import { getPrisma } from "@kartplan/db";
import type { SpendCategory, SpendProfileDto, SpendProfileInput } from "@kartplan/shared";

import { track } from "@/lib/analytics";
import type { MutationResult } from "@/lib/result";

/** Harcama profili için ana kategoriler ve markaları (adlara göre sıralı). */
export async function getSpendCategories(): Promise<SpendCategory[]> {
  const categories = await getPrisma().category.findMany({
    where: { parentId: null },
    orderBy: { name: "asc" },
    include: { merchants: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
  return categories.map(({ id, slug, name, merchants }) => ({ id, slug, name, merchants }));
}

export async function getSpendProfile(userId: string): Promise<SpendProfileDto> {
  const rows = await getPrisma().spendProfile.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
  });
  const items = rows.map((row) => ({
    categoryId: row.categoryId,
    categorySlug: row.category.slug,
    categoryName: row.category.name,
    monthlyKurus: row.monthlyKurus,
    merchantIds: row.merchantIds,
  }));
  return { items, totalKurus: items.reduce((sum, item) => sum + item.monthlyKurus, 0) };
}

export async function hasSpendProfile(userId: string): Promise<boolean> {
  return (await getPrisma().spendProfile.count({ where: { userId } })) > 0;
}

/**
 * Profili bütünüyle değiştirir: listedeki kategoriler yazılır, listede olmayanlar silinir.
 * Girdi `SpendProfileInput` ile doğrulanmış olmalıdır.
 */
export async function saveSpendProfile(
  userId: string,
  input: SpendProfileInput,
): Promise<MutationResult<SpendProfileDto>> {
  const prisma = getPrisma();
  const categoryIds = input.items.map((item) => item.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    include: { merchants: { select: { id: true } } },
  });
  if (categories.length !== categoryIds.length) {
    return { ok: false, code: "not_found", error: "Seçilen kategorilerden biri bulunamadı." };
  }
  for (const item of input.items) {
    const allowed = new Set(
      categories.find((c) => c.id === item.categoryId)?.merchants.map((m) => m.id),
    );
    if (item.merchantIds.some((id) => !allowed.has(id))) {
      return { ok: false, code: "not_found", error: "Seçilen marka bu kategoride değil." };
    }
  }

  await prisma.$transaction([
    prisma.spendProfile.deleteMany({ where: { userId, categoryId: { notIn: categoryIds } } }),
    ...input.items.map((item) =>
      prisma.spendProfile.upsert({
        where: { userId_categoryId: { userId, categoryId: item.categoryId } },
        update: { monthlyKurus: item.monthlyKurus, merchantIds: item.merchantIds },
        create: { userId, ...item },
      }),
    ),
  ]);
  track(userId, "spend_profile_saved", { categories: input.items.length });
  return { ok: true, data: await getSpendProfile(userId) };
}
