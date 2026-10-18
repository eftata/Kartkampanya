import { connection } from "next/server";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth/session";
import { computeFunnel, funnelCohorts, percent } from "@/lib/funnel";
import type { FunnelResult } from "@/lib/funnel";
import { getFunnelUsers } from "@/lib/funnel-data";

const weekFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const pct = (value: number | null) => (value === null ? "—" : `%${value}`);

function Week2({ week2 }: { week2: FunnelResult["week2"] }) {
  if (week2.eligible === 0) return <span className="text-muted-foreground">henüz ölçülemez</span>;
  return (
    <span>
      {week2.returned} / {week2.eligible}{" "}
      <span className="text-muted-foreground">
        ({pct(percent(week2.returned, week2.eligible))})
      </span>
    </span>
  );
}

async function Funnel() {
  await requireAdmin();
  await connection();
  const now = new Date();
  const users = await getFunnelUsers();
  const total = computeFunnel(users, now);
  const cohorts = funnelCohorts(users, now);
  const signups = total.steps[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Huni</h1>
        <p className="text-muted-foreground text-sm">
          Kayıt (açık rıza verildi) → kart girdi → planı gördü → 2. haftada geri döndü (kayıttan
          sonraki 7–13. günlerden birinde uygulamayı kullandı). Adminler ve silinmeyi bekleyen
          hesaplar dahil değil.
        </p>
      </div>

      <section aria-label="Toplam" className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">Toplam</h2>
        <ol className="grid gap-3 sm:grid-cols-4">
          {total.steps.map((step, index) => {
            const previous = index === 0 ? null : (total.steps[index - 1]?.count ?? 0);
            return (
              <li
                key={step.key}
                role="group"
                aria-label={step.label}
                className="rounded-lg border p-3"
              >
                <p className="text-muted-foreground text-xs">{step.label}</p>
                <p className="text-2xl font-semibold">{step.count}</p>
                {previous !== null && (
                  <p className="text-muted-foreground text-xs">
                    önceki adımın {pct(percent(step.count, previous))} · kaydın{" "}
                    {pct(percent(step.count, signups))}
                  </p>
                )}
              </li>
            );
          })}
          <li role="group" aria-label="2. hafta geri döndü" className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">2. hafta geri döndü</p>
            <p className="text-2xl font-semibold">{total.week2.returned}</p>
            <p className="text-muted-foreground text-xs">
              <Week2 week2={total.week2} />
            </p>
          </li>
        </ol>
      </section>

      <section aria-label="Kayıt haftasına göre" className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">Kayıt haftasına göre</h2>
        {cohorts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Henüz kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="py-1 pr-3 font-normal">Hafta</th>
                  <th className="py-1 pr-3 text-right font-normal">Kayıt</th>
                  <th className="py-1 pr-3 text-right font-normal">Kart</th>
                  <th className="py-1 pr-3 text-right font-normal">Plan</th>
                  <th className="py-1 font-normal">2. hafta</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => {
                  const [signup, card, plan] = cohort.steps.map((step) => step.count);
                  return (
                    <tr key={cohort.week} className="border-t">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {weekFormat.format(new Date(`${cohort.week}T00:00:00Z`))} haftası
                      </td>
                      <td className="py-2 pr-3 text-right">{signup}</td>
                      <td className="py-2 pr-3 text-right">
                        {card} ({pct(percent(card ?? 0, signup ?? 0))})
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {plan} ({pct(percent(plan ?? 0, signup ?? 0))})
                      </td>
                      <td className="py-2">
                        <Week2 week2={cohort.week2} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-muted-foreground text-xs">
        Ayrıntılı davranış analizi PostHog&apos;da (takma adlı olaylar, ADR 0022); bu sayfa yalnızca
        kendi veritabanımızdan sayar.
      </p>
    </div>
  );
}

export default function FunnelPage() {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <Funnel />
    </Suspense>
  );
}
