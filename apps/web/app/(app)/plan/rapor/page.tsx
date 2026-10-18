import { formatKurus } from "@kartplan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth/session";
import { turkeyToday } from "@/lib/campaign-match";
import { previousMonth } from "@/lib/month-report";
import type { MissedCampaign } from "@/lib/month-report";
import { getMonthReport, getReportMonths } from "@/lib/month-report-data";
import { monthLabel } from "@/lib/plan-request";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ay sonu raporu" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function missedText(item: MissedCampaign): string {
  if (item.reason === "not_joined") return "Harcaman eşiği tuttu ama kampanyaya katılmadın.";
  if (item.missing === null) return "Eşiğe ulaşılamadı.";
  if (item.kind === "count") return `Eşiğe ${item.missing} işlem kaldı.`;
  if (item.kind === "single")
    return `Tek seferde ${formatKurus(item.missing)} ve üzeri harcama gerekiyordu.`;
  return `Eşiğe ${formatKurus(item.missing)} kaldı.`;
}

async function ReportContent({ searchParams }: PageProps<"/plan/rapor">) {
  const user = await requireUser();
  const today = turkeyToday();
  const current = today.slice(0, 7);
  const params = await searchParams;
  const requested = Array.isArray(params.ay) ? params.ay[0] : params.ay;
  const month =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current
      ? requested
      : previousMonth(current);
  const [report, months] = await Promise.all([
    getMonthReport(user.id, month, today),
    getReportMonths(user.id, today),
  ]);
  const earnedTotal = report.campaignEarnedKurus + report.baseEarnedKurus;
  const missedTotal = report.missed.reduce((sum, item) => sum + item.rewardKurus, 0);
  const options = [...new Set([month, ...months])].sort().reverse();

  return (
    <div className="space-y-8">
      <nav aria-label="Aylar" className="flex flex-wrap gap-2">
        {options.map((item) => (
          <Link
            key={item}
            href={`/plan/rapor?ay=${item}`}
            aria-current={item === month ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              item === month ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {monthLabel(item)}
          </Link>
        ))}
      </nav>

      {!report.closed && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          Ay henüz bitmedi: rapor şimdiye kadarki harcamalarınla ve bitmiş kampanyalarla.
          {report.ongoing > 0 &&
            ` Bu ay bitecek ${report.ongoing} kampanyanın sonucu ay sonunda belli olacak.`}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          label="Kazandığın (tahmini)"
          value={formatKurus(earnedTotal)}
          hint={`Kampanyalar ${formatKurus(report.campaignEarnedKurus)} · kart puanı ${formatKurus(report.baseEarnedKurus)}`}
        />
        <Tile
          label="Kaçırdığın (tahmini)"
          value={formatKurus(missedTotal)}
          hint={report.missed.length ? `${report.missed.length} kampanya` : undefined}
        />
        <Tile
          label="Planın beklentisi"
          value={report.expectedKurus === null ? "—" : formatKurus(report.expectedKurus)}
          hint={`Bu ay ${formatKurus(report.spentKurus)} harcama girdin`}
        />
      </div>

      <section aria-label="Kazandıkların" className="space-y-2">
        <h2 className="font-medium">Kazandıkların</h2>
        {report.earned.length === 0 ? (
          <p className="text-muted-foreground text-sm">Bu ay biten kampanyalardan kazanç yok.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {report.earned.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
                <Link
                  href={`/kampanyalarim/${item.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {item.title}
                </Link>
                <span className="font-medium whitespace-nowrap">
                  ~{formatKurus(item.earnedKurus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Kaçırdıkların" className="space-y-2">
        <h2 className="font-medium">Kaçırdıkların</h2>
        {report.missed.length === 0 ? (
          <p className="text-muted-foreground text-sm">Kaçırdığın kampanya görünmüyor.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {report.missed.map((item) => (
              <li key={item.id} className="space-y-0.5 px-3 py-2">
                <p className="flex justify-between gap-3">
                  <Link
                    href={`/kampanyalarim/${item.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="whitespace-nowrap text-red-700 dark:text-red-400">
                    ~{formatKurus(item.rewardKurus)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">{missedText(item)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">
          Gereksiz harcamaya teşvik etmeyiz: eşiğe yaklaştığın kampanyalar yalnızca zaten yapacağın
          harcamalar için bilgi.
        </p>
      </section>

      {report.spentByCategory.length > 0 && (
        <section aria-label="Kategoriye göre harcama" className="space-y-2">
          <h2 className="font-medium">Kategoriye göre harcama</h2>
          <ul className="space-y-1 text-sm">
            {report.spentByCategory.map((row) => (
              <li key={row.categoryId} className="flex justify-between gap-3">
                <span>{report.categoryName[row.categoryId] ?? row.categoryId}</span>
                <span>{formatKurus(row.spentKurus)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>
          Rapor, Harcamalar sayfasına girdiğin harcamalardan hesaplanır; bir ayda biten kampanyalar
          o ayın raporuna girer. Kesin tutarlar bankanın ekstresindedir.
        </p>
        {report.unverifiedRates && (
          <p>Bazı kartlarının temel kazanç oranları henüz doğrulanmadı; kart puanı tahminidir.</p>
        )}
        {report.spentKurus === 0 && (
          <p>
            Bu ay harcama girmedin.{" "}
            <Link href="/harcamalar" className="underline">
              Harcama ekle
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function MonthReportPage(props: PageProps<"/plan/rapor">) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/plan" className="text-muted-foreground text-sm underline">
          ← Bu ayın planı
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Ay sonu raporu</h1>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <ReportContent {...props} />
      </Suspense>
    </div>
  );
}
