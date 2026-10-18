import "server-only";

import { PlanResponse, StatementErrorCode, StatementParseResult } from "@kartplan/shared";
import type { PlanRequestInput } from "@kartplan/shared";
import { connection } from "next/server";

export type EngineResult = { ok: true; plan: PlanResponse } | { ok: false; error: string };

const TIMEOUT_MS = 10_000; // motorun 2 sn çözücü sınırı + ağ ve kurulum payı

/**
 * Optimizasyon motoru (`POST /optimize`, ENGINE_TOKEN ile). Yanıt zod ile doğrulanır. Hata
 * ayrıntısı kullanıcıya gösterilmez, sunucu günlüğüne yazılır.
 */
export async function optimizePlan(request: PlanRequestInput): Promise<EngineResult> {
  // Ön-render (ör. bağlantı ön yüklemesi) burada durur: motor yalnızca gerçek istekte çağrılır.
  // Aksi halde ön-render bitince iptal edilen fetch aşağıda "ulaşılamadı" hatasına dönüşürdü.
  await connection();
  const url = process.env.ENGINE_URL;
  const token = process.env.ENGINE_TOKEN;
  if (!url || !token) return { ok: false, error: "Plan servisi yapılandırılmamış." };
  try {
    const response = await fetch(new URL("/optimize", url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`engine /optimize ${response.status}: ${await response.text()}`);
      return { ok: false, error: "Plan şu anda hesaplanamadı." };
    }
    const parsed = PlanResponse.safeParse(await response.json());
    if (!parsed.success) {
      console.error("engine /optimize: geçersiz yanıt", parsed.error.issues[0]);
      return { ok: false, error: "Plan şu anda hesaplanamadı." };
    }
    return { ok: true, plan: parsed.data };
  } catch (error) {
    console.error("engine /optimize:", error);
    return { ok: false, error: "Plan servisine ulaşılamadı." };
  }
}

export type StatementParseOutcome =
  | { ok: true; result: StatementParseResult }
  | { ok: false; code: StatementErrorCode | "unavailable" };

/**
 * Ekstre PDF'ini motora ayrıştırtır (`POST /statements/parse`; ADR 0028). PDF ve parola yalnızca
 * bu istekte gider; hata ayrıntısı (gövde) günlüğe yazılmaz, yalnızca durum kodu.
 */
export async function parseStatementPdf(
  pdf: Uint8Array,
  password: string | null,
): Promise<StatementParseOutcome> {
  await connection();
  const url = process.env.ENGINE_URL;
  const token = process.env.ENGINE_TOKEN;
  if (!url || !token) return { ok: false, code: "unavailable" };
  try {
    const response = await fetch(new URL("/statements/parse", url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pdfBase64: Buffer.from(pdf).toString("base64"),
        ...(password ? { password } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (response.status === 422) {
      const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      const code = StatementErrorCode.safeParse(body?.detail);
      return { ok: false, code: code.success ? code.data : "invalid" };
    }
    if (!response.ok) {
      console.error(`engine /statements/parse ${response.status}`);
      return { ok: false, code: "unavailable" };
    }
    const parsed = StatementParseResult.safeParse(await response.json());
    if (!parsed.success) {
      console.error("engine /statements/parse: geçersiz yanıt");
      return { ok: false, code: "unavailable" };
    }
    return { ok: true, result: parsed.data };
  } catch (error) {
    console.error("engine /statements/parse:", error instanceof Error ? error.name : "error");
    return { ok: false, code: "unavailable" };
  }
}
