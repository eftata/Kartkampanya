"use server";

import { AddUserCardInput, parseTlInput, UpdateUserCardInput } from "@kartplan/shared";
import type { UserCardDto } from "@kartplan/shared";

import { requireUser } from "@/lib/auth/session";
import { addUserCard, removeUserCard, updateUserCard } from "@/lib/user-cards";

export type AddCardState =
  { status: "idle" } | { status: "error"; error: string } | { status: "added"; card: UserCardDto };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function addCardAction(
  _prev: AddCardState,
  formData: FormData,
): Promise<AddCardState> {
  const user = await requireUser();

  const limitKurus = parseTlInput(text(formData, "limit"));
  if (limitKurus === null) {
    return { status: "error", error: "Limiti TL olarak yaz (ör. 50.000)." };
  }
  const statementDayText = text(formData, "statementDay");
  const parsed = AddUserCardInput.safeParse({
    cardProductId: text(formData, "cardProductId"),
    nickname: text(formData, "nickname"),
    limitKurus,
    statementDay: statementDayText ? Number(statementDayText) : undefined,
  });
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  }

  const result = await addUserCard(user.id, parsed.data);
  return result.ok
    ? { status: "added", card: result.data }
    : { status: "error", error: result.error };
}

export async function removeCardAction(userCardId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const result = await removeUserCard(user.id, userCardId);
  return result.ok ? {} : { error: result.error };
}

export type UpdateCardResult = { card?: UserCardDto; error?: string };

/** Düzenleme formu: boş bırakılan alan değeri temizler. */
export async function updateCardAction(
  userCardId: string,
  formData: FormData,
): Promise<UpdateCardResult> {
  const user = await requireUser();

  const limitKurus = parseTlInput(text(formData, "limit"));
  if (limitKurus === null) return { error: "Limiti TL olarak yaz (ör. 50.000)." };
  const statementDayText = text(formData, "statementDay");
  const parsed = UpdateUserCardInput.safeParse({
    nickname: text(formData, "nickname"),
    limitKurus: limitKurus ?? null,
    statementDay: statementDayText ? Number(statementDayText) : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };

  const result = await updateUserCard(user.id, userCardId, parsed.data);
  return result.ok ? { card: result.data } : { error: result.error };
}
