import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import type {
  AdminBankInput,
  AdminCardCreateInput,
  AdminCardUpdateInput,
  AdminProgramCreateInput,
  AdminProgramUpdateInput,
} from "@kartplan/shared";

import type { MutationResult } from "@/lib/result";

/** İşlemi yapan admin; işlem kaydına yazılır. */
export type Actor = { id: string; email: string };

type Tx = Prisma.TransactionClient;
type EntityType = "Bank" | "Program" | "CardProduct";

const fail = (code: "not_found" | "conflict", error: string) =>
  ({ ok: false, code, error }) as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: EntityType,
  entityId: string,
  data: Record<string, unknown> = {},
) {
  await tx.adminAuditLog.create({
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      entityType,
      entityId,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
    },
  });
}

/** Önce/sonra farkı: yalnızca değişen alanlar. */
function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(after)) {
    const from = before[key];
    if (to !== undefined && String(from) !== String(to)) changes[key] = { from, to };
  }
  return changes;
}

/**
 * Doğrulama tarihi kuralı: `verified` true → mevcut tarih korunur (değer değişmediyse) ya da şimdi;
 * false → temizlenir; gönderilmemişse → değer değiştiyse temizlenir, değişmediyse aynen kalır.
 */
function nextVerifiedAt(
  current: Date | null,
  verified: boolean | undefined,
  valueChanged: boolean,
) {
  if (verified === true) return current && !valueChanged ? current : new Date();
  if (verified === false) return null;
  return valueChanged ? null : current;
}

// ---------- Okuma ----------

export async function getAdminCatalog() {
  return getPrisma().bank.findMany({
    orderBy: { name: "asc" },
    include: {
      programs: {
        orderBy: { name: "asc" },
        include: {
          cards: {
            orderBy: { name: "asc" },
            include: { _count: { select: { userCards: true, earnRates: true } } },
          },
        },
      },
    },
  });
}
export type AdminCatalog = Awaited<ReturnType<typeof getAdminCatalog>>;

export async function getAdminProgram(id: string) {
  return getPrisma().program.findUnique({
    where: { id },
    include: {
      bank: true,
      cards: { orderBy: { name: "asc" }, include: { _count: { select: { userCards: true } } } },
    },
  });
}

export async function getAdminCard(id: string) {
  return getPrisma().cardProduct.findUnique({
    where: { id },
    include: {
      program: { include: { bank: true } },
      earnRates: { include: { category: true }, orderBy: { category: { name: "asc" } } },
      _count: { select: { userCards: true } },
    },
  });
}

export async function getAuditLog(
  filter: { entityType?: EntityType; entityId?: string },
  take = 20,
) {
  return getPrisma().adminAuditLog.findMany({
    where: filter,
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ---------- Banka ----------

export async function createBank(
  actor: Actor,
  input: AdminBankInput,
): Promise<MutationResult<{ id: string }>> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const bank = await tx.bank.create({ data: input });
      await audit(tx, actor, "bank.create", "Bank", bank.id, { name: input.name });
      return { ok: true, data: { id: bank.id } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("conflict", "Bu adla bir banka zaten var.");
    throw error;
  }
}

export async function updateBank(
  actor: Actor,
  id: string,
  input: AdminBankInput,
): Promise<MutationResult> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const before = await tx.bank.findUnique({ where: { id } });
      if (!before) return fail("not_found", "Banka bulunamadı.");
      await tx.bank.update({ where: { id }, data: input });
      await audit(tx, actor, "bank.update", "Bank", id, diff(before, input));
      return { ok: true, data: undefined };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("conflict", "Bu adla bir banka zaten var.");
    throw error;
  }
}

export async function deleteBank(actor: Actor, id: string): Promise<MutationResult> {
  return getPrisma().$transaction(async (tx) => {
    const bank = await tx.bank.findUnique({
      where: { id },
      include: { _count: { select: { programs: true } } },
    });
    if (!bank) return fail("not_found", "Banka bulunamadı.");
    if (bank._count.programs > 0) return fail("conflict", "Önce bankanın programlarını sil.");
    await tx.bank.delete({ where: { id } });
    await audit(tx, actor, "bank.delete", "Bank", id, { name: bank.name });
    return { ok: true, data: undefined };
  });
}

// ---------- Program ----------

export async function createProgram(
  actor: Actor,
  input: AdminProgramCreateInput,
): Promise<MutationResult<{ id: string }>> {
  const { pointValueVerified, ...data } = input;
  try {
    return await getPrisma().$transaction(async (tx) => {
      if (!(await tx.bank.findUnique({ where: { id: input.bankId } }))) {
        return fail("not_found", "Banka bulunamadı.");
      }
      const program = await tx.program.create({
        data: { ...data, pointValueVerifiedAt: pointValueVerified ? new Date() : null },
      });
      await audit(tx, actor, "program.create", "Program", program.id, {
        ...data,
        pointValueVerified,
      });
      return { ok: true, data: { id: program.id } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("conflict", "Bu kısa ad ya da bu bankada bu adla bir program zaten var.");
    }
    throw error;
  }
}

export async function updateProgram(
  actor: Actor,
  id: string,
  input: AdminProgramUpdateInput,
): Promise<MutationResult> {
  const { pointValueVerified, ...data } = input;
  try {
    return await getPrisma().$transaction(async (tx) => {
      const before = await tx.program.findUnique({ where: { id } });
      if (!before) return fail("not_found", "Program bulunamadı.");
      const valueChanged =
        data.pointValueTL !== undefined && !before.pointValueTL.equals(data.pointValueTL);
      const pointValueVerifiedAt = nextVerifiedAt(
        before.pointValueVerifiedAt,
        pointValueVerified,
        valueChanged,
      );
      await tx.program.update({ where: { id }, data: { ...data, pointValueVerifiedAt } });
      const changes = diff({ ...before, pointValueTL: before.pointValueTL.toString() }, data);
      const verifiedChanged = String(before.pointValueVerifiedAt) !== String(pointValueVerifiedAt);
      await audit(
        tx,
        actor,
        verifiedChanged && pointValueVerifiedAt ? "program.verify_point_value" : "program.update",
        "Program",
        id,
        verifiedChanged
          ? {
              ...changes,
              pointValueVerifiedAt: { from: before.pointValueVerifiedAt, to: pointValueVerifiedAt },
            }
          : changes,
      );
      return { ok: true, data: undefined };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("conflict", "Bu kısa ad ya da bu bankada bu adla bir program zaten var.");
    }
    throw error;
  }
}

export async function deleteProgram(actor: Actor, id: string): Promise<MutationResult> {
  return getPrisma().$transaction(async (tx) => {
    const program = await tx.program.findUnique({
      where: { id },
      include: { _count: { select: { cards: true } } },
    });
    if (!program) return fail("not_found", "Program bulunamadı.");
    if (program._count.cards > 0) return fail("conflict", "Önce programın kartlarını sil.");
    await tx.program.delete({ where: { id } });
    await audit(tx, actor, "program.delete", "Program", id, {
      slug: program.slug,
      name: program.name,
    });
    return { ok: true, data: undefined };
  });
}

// ---------- Kart ürünü ----------

export async function createCard(
  actor: Actor,
  input: AdminCardCreateInput,
): Promise<MutationResult<{ id: string }>> {
  const { ratesVerified, ...data } = input;
  try {
    return await getPrisma().$transaction(async (tx) => {
      if (!(await tx.program.findUnique({ where: { id: input.programId } }))) {
        return fail("not_found", "Program bulunamadı.");
      }
      const card = await tx.cardProduct.create({
        data: { ...data, ratesVerifiedAt: ratesVerified ? new Date() : null },
      });
      await audit(tx, actor, "card.create", "CardProduct", card.id, { ...data, ratesVerified });
      return { ok: true, data: { id: card.id } };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      return fail("conflict", "Bu programda bu adla bir kart zaten var.");
    throw error;
  }
}

export async function updateCard(
  actor: Actor,
  id: string,
  input: AdminCardUpdateInput,
): Promise<MutationResult> {
  const { ratesVerified, rates, ...data } = input;
  try {
    return await getPrisma().$transaction(async (tx) => {
      const before = await tx.cardProduct.findUnique({
        where: { id },
        include: { earnRates: true },
      });
      if (!before) return fail("not_found", "Kart bulunamadı.");

      let ratesChanged = data.baseRateBps !== undefined && data.baseRateBps !== before.baseRateBps;
      const ratesDiff: Record<string, unknown> = {};
      if (rates) {
        const categoryIds = rates.map((r) => r.categoryId);
        if (
          (await tx.category.count({ where: { id: { in: categoryIds } } })) !== categoryIds.length
        ) {
          return fail("not_found", "Kategorilerden biri bulunamadı.");
        }
        const asText = (list: { categoryId: string; rateBps: number }[]) =>
          JSON.stringify(
            [...list]
              .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
              .map((r) => [r.categoryId, r.rateBps]),
          );
        if (asText(before.earnRates) !== asText(rates)) {
          ratesChanged = true;
          ratesDiff.rates = {
            from: before.earnRates.map(({ categoryId, rateBps }) => ({ categoryId, rateBps })),
            to: rates,
          };
        }
        await tx.earnRate.deleteMany({
          where: { cardProductId: id, categoryId: { notIn: categoryIds } },
        });
        for (const rate of rates) {
          await tx.earnRate.upsert({
            where: { cardProductId_categoryId: { cardProductId: id, categoryId: rate.categoryId } },
            update: { rateBps: rate.rateBps },
            create: { cardProductId: id, ...rate },
          });
        }
      }

      const ratesVerifiedAt = nextVerifiedAt(before.ratesVerifiedAt, ratesVerified, ratesChanged);
      await tx.cardProduct.update({ where: { id }, data: { ...data, ratesVerifiedAt } });
      const verifiedChanged = String(before.ratesVerifiedAt) !== String(ratesVerifiedAt);
      await audit(
        tx,
        actor,
        verifiedChanged && ratesVerifiedAt ? "card.verify_rates" : "card.update",
        "CardProduct",
        id,
        {
          ...diff(before, data),
          ...ratesDiff,
          ...(verifiedChanged
            ? { ratesVerifiedAt: { from: before.ratesVerifiedAt, to: ratesVerifiedAt } }
            : {}),
        },
      );
      return { ok: true, data: undefined };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      return fail("conflict", "Bu programda bu adla bir kart zaten var.");
    throw error;
  }
}

export async function deleteCard(actor: Actor, id: string): Promise<MutationResult> {
  return getPrisma().$transaction(async (tx) => {
    const card = await tx.cardProduct.findUnique({
      where: { id },
      include: { _count: { select: { userCards: true } } },
    });
    if (!card) return fail("not_found", "Kart bulunamadı.");
    if (card._count.userCards > 0) {
      return fail("conflict", `Bu kartı ${card._count.userCards} kullanıcı seçmiş; silinemez.`);
    }
    await tx.cardProduct.delete({ where: { id } });
    await audit(tx, actor, "card.delete", "CardProduct", id, { name: card.name });
    return { ok: true, data: undefined };
  });
}
