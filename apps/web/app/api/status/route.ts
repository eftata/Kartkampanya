import { connection } from "next/server";

import { overallState } from "@/lib/system-health";
import { checkComponents } from "@/lib/system-status";

/**
 * Dış izleme (uptime) için bileşen durumu (ADR 0023): veritabanı, Redis, motor. Yalnızca
 * "ok/down/disabled" ve süre döner; adres ya da hata ayrıntısı yok. Hizmet çalışamıyorsa 503.
 * `/api/health` yalnızca canlılıktır (süreç ayakta mı); bu uç bağımlılıkları da yoklar.
 */
export async function GET() {
  await connection();
  const checks = await checkComponents();
  const status = overallState(checks);
  return Response.json(
    { status, checks },
    { status: status === "down" ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}
