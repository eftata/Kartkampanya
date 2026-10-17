"use server";

import {
  AdminBankInput,
  AdminCardCreateInput,
  AdminCardUpdateInput,
  AdminProgramCreateInput,
  AdminProgramUpdateInput,
  parsePercentInput,
  parseTlInput,
} from "@kartplan/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import * as catalog from "@/lib/admin-catalog";
import type { Actor } from "@/lib/admin-catalog";
import { requireAdmin } from "@/lib/auth/session";
import type { MutationResult } from "@/lib/result";

export type ActionResult = { ok?: boolean; error?: string };

async function actor(): Promise<Actor> {
  const user = await requireAdmin();
  return { id: user.id, email: user.email };
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const checked = (formData: FormData, name: string) => formData.get(name) === "on";

class InvalidInput extends Error {}

/** Yüzde alanı → bps. Geçersizse kullanıcıya gösterilecek hatayı fırlatır. */
function percent(formData: FormData, name: string, label: string): number | undefined {
  const value = parsePercentInput(text(formData, name));
  if (value === null) throw new InvalidInput(`${label}: oranı yüzde olarak yaz (ör. 0,5).`);
  return value;
}

/** TL alanı → kuruş; boşsa null. */
function money(formData: FormData, name: string, label: string): number | null {
  const value = parseTlInput(text(formData, name));
  if (value === null) throw new InvalidInput(`${label}: tutarı TL olarak yaz (ör. 1.250).`);
  return value ?? null;
}

async function run<T extends z.ZodType>(
  schema: T,
  build: () => unknown,
  execute: (input: z.infer<T>, who: Actor) => Promise<MutationResult<unknown>>,
  onSuccess?: (data: unknown) => never,
): Promise<ActionResult> {
  const who = await actor();
  let raw: unknown;
  try {
    raw = build();
  } catch (error) {
    if (error instanceof InvalidInput) return { error: error.message };
    throw error;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgi." };
  const result = await execute(parsed.data, who);
  if (!result.ok) return { error: result.error };
  if (onSuccess) onSuccess(result.data);
  refresh();
  return { ok: true };
}

// ---------- Banka ----------

export async function createBankAction(formData: FormData) {
  return run(
    AdminBankInput,
    () => ({ name: text(formData, "name") }),
    (input, who) => catalog.createBank(who, input),
  );
}

export async function updateBankAction(id: string, formData: FormData) {
  return run(
    AdminBankInput,
    () => ({ name: text(formData, "name") }),
    (input, who) => catalog.updateBank(who, id, input),
  );
}

export async function deleteBankAction(id: string): Promise<ActionResult> {
  const result = await catalog.deleteBank(await actor(), id);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

// ---------- Program ----------

const programFields = (formData: FormData) => ({
  slug: text(formData, "slug"),
  name: text(formData, "name"),
  pointName: text(formData, "pointName"),
  pointValueTL: text(formData, "pointValueTL"),
  pointValueVerified: checked(formData, "pointValueVerified"),
});

export async function createProgramAction(bankId: string, formData: FormData) {
  return run(
    AdminProgramCreateInput,
    () => ({ bankId, ...programFields(formData) }),
    (input, who) => catalog.createProgram(who, input),
    (data) => redirect(`/admin/katalog/program/${(data as { id: string }).id}`),
  );
}

export async function updateProgramAction(id: string, formData: FormData) {
  return run(
    AdminProgramUpdateInput,
    () => programFields(formData),
    (input, who) => catalog.updateProgram(who, id, input),
  );
}

export async function deleteProgramAction(id: string): Promise<ActionResult> {
  const result = await catalog.deleteProgram(await actor(), id);
  if (!result.ok) return { error: result.error };
  redirect("/admin/katalog");
}

// ---------- Kart ----------

const cardFields = (formData: FormData) => ({
  name: text(formData, "name"),
  type: text(formData, "type"),
  annualFee: money(formData, "annualFee", "Yıllık ücret"),
  baseRateBps: percent(formData, "baseRate", "Temel oran") ?? 0,
  ratesVerified: checked(formData, "ratesVerified"),
});

export async function createCardAction(programId: string, formData: FormData) {
  return run(
    AdminCardCreateInput,
    () => ({ programId, ...cardFields(formData) }),
    (input, who) => catalog.createCard(who, input),
    (data) => redirect(`/admin/katalog/kart/${(data as { id: string }).id}`),
  );
}

/** Kategori oranı alanları `rate:<kategoriId>` adını taşır; boş alan o kategoride özel oran yok demektir. */
export async function updateCardAction(id: string, formData: FormData) {
  return run(
    AdminCardUpdateInput,
    () => {
      const rates: { categoryId: string; rateBps: number }[] = [];
      for (const [key] of formData.entries()) {
        if (!key.startsWith("rate:")) continue;
        const rateBps = percent(
          formData,
          key,
          String(formData.get(`label:${key.slice(5)}`) ?? "Kategori"),
        );
        if (rateBps !== undefined) rates.push({ categoryId: key.slice(5), rateBps });
      }
      return { ...cardFields(formData), rates };
    },
    (input, who) => catalog.updateCard(who, id, input),
  );
}

export async function deleteCardAction(id: string, programId: string): Promise<ActionResult> {
  const result = await catalog.deleteCard(await actor(), id);
  if (!result.ok) return { error: result.error };
  redirect(`/admin/katalog/program/${programId}`);
}
