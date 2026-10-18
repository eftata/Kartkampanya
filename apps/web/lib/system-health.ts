/**
 * İzleme kuralları (saf; ADR 0023): bileşen durumu ve zamanlanmış işlerin gecikmesi.
 */

export type ComponentState = "ok" | "down" | "disabled";
export type ComponentCheck = { state: ComponentState; ms: number };
export type Components = {
  database: ComponentCheck;
  redis: ComponentCheck;
  engine: ComponentCheck;
};

/**
 * Genel durum: veritabanı ya da motor yoksa hizmet çalışmaz ("down"). Redis yoksa istek sınırı
 * bellekte/devre dışı kalır ama site çalışır ("degraded").
 */
export function overallState(components: Components): "ok" | "degraded" | "down" {
  if (components.database.state !== "ok" || components.engine.state !== "ok") return "down";
  return components.redis.state === "down" ? "degraded" : "ok";
}

export type RunLike = {
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
};

export type RunHealth = "ok" | "late" | "failed" | "stuck" | "never";

const HOUR = 3_600_000;
/** Bu süreden uzun "RUNNING" kalan iş takılmış sayılır (Vercel ve Railway işleri dakikalar sürer). */
const STUCK_AFTER_HOURS = 1;

/** Günlük işin son çalışmasının sağlığı: `maxAgeHours` içinde başarıyla bitmiş olmalı. */
export function runHealth(last: RunLike | null, now: Date, maxAgeHours: number): RunHealth {
  if (!last) return "never";
  const age = now.getTime() - last.startedAt.getTime();
  if (last.status === "RUNNING") {
    return age > STUCK_AFTER_HOURS * HOUR ? "stuck" : "ok";
  }
  if (last.status === "FAILED") return "failed";
  return age > maxAgeHours * HOUR ? "late" : "ok";
}

export const RUN_HEALTH_LABELS: Record<RunHealth, string> = {
  ok: "Zamanında",
  late: "Gecikti",
  failed: "Başarısız",
  stuck: "Takıldı",
  never: "Hiç çalışmadı",
};

/** Kaynakta görünmemeye tolerans: tek bir taramada listeden düşmesi (sayfalama vb.) yeterli değil. */
const MISSING_AFTER_HOURS = 36;

/**
 * Onaylı kampanya kaynağın son başarılı taramalarında listede görünmüyor mu? Banka kampanyayı
 * kaldırmış ya da erken bitirmiş olabilir (ADR 0026). Kaynak hiç başarıyla taranmadıysa bilinemez.
 */
export function missingFromSource(lastSeenAt: Date, lastSuccessfulRunAt: Date | null): boolean {
  if (!lastSuccessfulRunAt) return false;
  return lastSuccessfulRunAt.getTime() - lastSeenAt.getTime() > MISSING_AFTER_HOURS * HOUR;
}
