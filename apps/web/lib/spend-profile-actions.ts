"use server";

import { SpendProfileInput } from "@kartplan/shared";

import { requireUser } from "@/lib/auth/session";
import { saveSpendProfile } from "@/lib/spend-profile";

export async function saveSpendProfileAction(input: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = SpendProfileInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  }
  const result = await saveSpendProfile(user.id, parsed.data);
  return result.ok ? {} : { error: result.error };
}
