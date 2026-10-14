import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";
import { MAX_USER_CARDS } from "@kartplan/shared";
import type { AddUserCardInput, UpdateUserCardInput, UserCardDto } from "@kartplan/shared";

import type { MutationResult } from "@/lib/result";

const include = {
  cardProduct: { include: { program: { include: { bank: true } } } },
} satisfies Prisma.UserCardInclude;

type UserCardRow = Prisma.UserCardGetPayload<{ include: typeof include }>;

function toDto(row: UserCardRow): UserCardDto {
  return {
    id: row.id,
    cardProductId: row.cardProductId,
    cardName: row.cardProduct.name,
    programName: row.cardProduct.program.name,
    bankName: row.cardProduct.program.bank.name,
    nickname: row.nickname,
    limitKurus: row.limitKurus,
    statementDay: row.statementDay,
  };
}

export async function listUserCards(userId: string): Promise<UserCardDto[]> {
  const rows = await getPrisma().userCard.findMany({
    where: { userId },
    include,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDto);
}

export async function countUserCards(userId: string): Promise<number> {
  return getPrisma().userCard.count({ where: { userId } });
}

/** Girdi `AddUserCardInput` ile doğrulanmış olmalıdır. */
export async function addUserCard(
  userId: string,
  input: AddUserCardInput,
): Promise<MutationResult<UserCardDto>> {
  const prisma = getPrisma();
  const product = await prisma.cardProduct.findUnique({ where: { id: input.cardProductId } });
  if (!product) return { ok: false, code: "not_found", error: "Seçilen kart bulunamadı." };

  const existing = await prisma.userCard.findMany({
    where: { userId },
    select: { cardProductId: true },
  });
  if (existing.length >= MAX_USER_CARDS) {
    return { ok: false, code: "limit", error: `En fazla ${MAX_USER_CARDS} kart ekleyebilirsin.` };
  }
  if (existing.some((card) => card.cardProductId === input.cardProductId)) {
    return { ok: false, code: "conflict", error: "Bu kart zaten ekli." };
  }

  const row = await prisma.userCard.create({
    data: {
      userId,
      cardProductId: input.cardProductId,
      nickname: input.nickname ?? null,
      limitKurus: input.limitKurus ?? null,
      statementDay: input.statementDay ?? null,
    },
    include,
  });
  return { ok: true, data: toDto(row) };
}

/** Kartın ayrıntılarını günceller; yalnızca kullanıcının kendi kartı. Girdi doğrulanmış olmalıdır. */
export async function updateUserCard(
  userId: string,
  userCardId: string,
  input: UpdateUserCardInput,
): Promise<MutationResult<UserCardDto>> {
  const prisma = getPrisma();
  const { count } = await prisma.userCard.updateMany({
    where: { id: userCardId, userId },
    data: input,
  });
  if (count !== 1) return { ok: false, code: "not_found", error: "Kart bulunamadı." };
  const row = await prisma.userCard.findUniqueOrThrow({ where: { id: userCardId }, include });
  return { ok: true, data: toDto(row) };
}

/** Yalnızca kullanıcının kendi kartını siler; başkasının kartı "bulunamadı" sayılır. */
export async function removeUserCard(userId: string, userCardId: string): Promise<MutationResult> {
  const { count } = await getPrisma().userCard.deleteMany({ where: { id: userCardId, userId } });
  return count === 1
    ? { ok: true, data: undefined }
    : { ok: false, code: "not_found", error: "Kart bulunamadı." };
}
