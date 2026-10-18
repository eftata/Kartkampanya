import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth/session";
import { overallState, RUN_HEALTH_LABELS } from "@/lib/system-health";
import type { ComponentState, RunHealth } from "@/lib/system-health";
import { getSystemOverview } from "@/lib/system-status";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});
const when = (date: Date | null | undefined) => (date ? timeFormat.format(date) : "—");

const COMPONENT_LABELS = { database: "Veritabanı", redis: "Redis (istek sınırı)", engine: "Motor" };
const STATE_LABELS: Record<ComponentState, string> = {
  ok: "Çalışıyor",
  down: "Ulaşılamıyor",
  disabled: "Yapılandırılmamış",
};
const OVERALL_LABELS = { ok: "Tüm sistemler çalışıyor", degraded: "Kısıtlı", down: "Sorun var" };
const NOTIFICATION_LABELS: Record<string, string> = {
  JOIN_REMINDER: "Katılım hatırlatma",
  ENDING_SOON: "Bitiyor uyarısı",
  WEEKLY_SUMMARY: "Haftalık özet",
};

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        tone === "bad" && "bg-red-500/10 text-red-700 dark:text-red-400",
      )}
    >
      {children}
    </span>
  );
}

function HealthBadge({ health }: { health: RunHealth }) {
  const tone = health === "ok" ? "ok" : health === "late" || health === "never" ? "warn" : "bad";
  return <Badge tone={tone}>{RUN_HEALTH_LABELS[health]}</Badge>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

async function SystemStatus() {
  await requireAdmin();
  await connection();
  const overview = await getSystemOverview();
  const overall = overallState(overview.components);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sistem durumu</h1>
          <p className="text-muted-foreground text-sm">
            Kontrol zamanı: {when(overview.checkedAt)}. Dış izleme için{" "}
            <code className="text-xs">/api/status</code>.
          </p>
        </div>
        <Badge tone={overall === "ok" ? "ok" : overall === "degraded" ? "warn" : "bad"}>
          {OVERALL_LABELS[overall]}
        </Badge>
      </div>

      <Section title="Bileşenler">
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[]).map((key) => {
            const check = overview.components[key];
            return (
              <li key={key} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">{COMPONENT_LABELS[key]}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{check.ms} ms</span>
                  <Badge
                    tone={check.state === "ok" ? "ok" : check.state === "disabled" ? "warn" : "bad"}
                  >
                    {STATE_LABELS[check.state]}
                  </Badge>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Zamanlanmış işler">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="py-1 pr-3 font-normal">İş</th>
                <th className="py-1 pr-3 font-normal">Durum</th>
                <th className="py-1 pr-3 font-normal">Son başlama</th>
                <th className="py-1 font-normal">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {overview.jobs.map((job) => (
                <tr key={job.name} className="border-t align-top">
                  <td className="py-2 pr-3">{job.label}</td>
                  <td className="py-2 pr-3">
                    <HealthBadge health={job.health} />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{when(job.last?.startedAt)}</td>
                  <td className="text-muted-foreground py-2 text-xs">
                    {job.last?.error ?? (job.last?.summary ? JSON.stringify(job.last.summary) : "")}
                  </td>
                </tr>
              ))}
              {overview.pipeline.map((source) => (
                <tr key={source.adapter} className="border-t align-top">
                  <td className="py-2 pr-3">
                    Veri hattı · {source.program}{" "}
                    <span className="text-muted-foreground text-xs">({source.adapter})</span>
                  </td>
                  <td className="py-2 pr-3">
                    {source.health ? (
                      <HealthBadge health={source.health} />
                    ) : (
                      <Badge tone="warn">Kapalı</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{when(source.last?.startedAt)}</td>
                  <td className="text-muted-foreground py-2 text-xs">
                    {source.last &&
                      `bulunan ${source.last.found} · değişen ${source.last.changed} · hata ${source.errorCount}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {overview.pipeline.length === 0 && (
            <p className="text-muted-foreground mt-2 text-sm">
              Henüz veri hattı kaynağı yok (adaptörler ilk çalıştırmada kaynağını oluşturur).
            </p>
          )}
        </div>
      </Section>

      <Section title="Son 24 saat ve kampanyalar">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Onay bekleyen"
            value={overview.queue.drafts}
            hint={
              overview.queue.oldestDraftAt
                ? `en eskisi ${when(overview.queue.oldestDraftAt)}`
                : undefined
            }
          />
          <Stat
            label="Yayındaki kampanya"
            value={overview.campaigns.active}
            hint={`${overview.campaigns.endingSoon} tanesi 7 gün içinde bitiyor`}
          />
          <Stat label="Hesaplanan plan" value={overview.last24h.plans} />
          <Stat
            label="Kullanıcı"
            value={overview.users.active}
            hint={`${overview.users.pendingDeletion} hesap silinmeyi bekliyor`}
          />
          {Object.entries(NOTIFICATION_LABELS).map(([kind, label]) => (
            <Stat
              key={kind}
              label={`E-posta: ${label}`}
              value={overview.last24h.notifications[kind] ?? 0}
            />
          ))}
        </div>
        {overview.queue.drafts > 0 && (
          <Link href="/admin/kampanyalar" className="text-sm underline">
            Onay kuyruğuna git
          </Link>
        )}
      </Section>
    </div>
  );
}

export default function SystemStatusPage() {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <SystemStatus />
    </Suspense>
  );
}
