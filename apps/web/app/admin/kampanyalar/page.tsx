import type { CampaignStatus } from "@kartplan/shared";
import Link from "next/link";
import { Suspense } from "react";

import { getReviewQueue } from "@/lib/admin-campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/admin-labels";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** URL'deki durum adı (Türkçe) → veritabanı durumu. */
const TABS: { slug: string; status: CampaignStatus }[] = [
  { slug: "bekleyen", status: "DRAFT" },
  { slug: "onaylanan", status: "APPROVED" },
  { slug: "reddedilen", status: "REJECTED" },
  { slug: "suresi-dolan", status: "EXPIRED" },
];

const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "UTC" });

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const percent = Math.round(value * 100);
  return (
    <span className={cn(percent < 70 && "font-medium text-amber-700 dark:text-amber-400")}>
      %{percent}
    </span>
  );
}

async function ReviewQueue({ searchParams }: PageProps<"/admin/kampanyalar">) {
  await requireAdmin();
  const { durum } = await searchParams;
  const tab = TABS.find((item) => item.slug === durum) ?? TABS[0]!;
  const { campaigns, counts } = await getReviewQueue(tab.status);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Onay kuyruğu</h1>
        <p className="text-muted-foreground text-sm">
          Veri hattının ayıkladığı kampanyalar onaylanmadan kullanıcıya görünmez. Bitişi en yakın
          olan en üstte.
        </p>
      </div>

      <nav aria-label="Kampanya durumu" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.slug}
            href={item.slug === "bekleyen" ? "/admin/kampanyalar" : `?durum=${item.slug}`}
            aria-current={item === tab ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              item === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {CAMPAIGN_STATUS_LABELS[item.status]} ({counts[item.status] ?? 0})
          </Link>
        ))}
      </nav>

      {campaigns.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {tab.status === "DRAFT" ? "Onay bekleyen kampanya yok." : "Bu durumda kampanya yok."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" aria-label="Kampanyalar">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-normal">Kampanya</th>
                <th className="px-3 py-2 font-normal">Program</th>
                <th className="px-3 py-2 font-normal">Bitiş</th>
                <th className="px-3 py-2 font-normal">Güven</th>
                <th className="px-3 py-2 font-normal">Belirsiz</th>
                <th className="px-3 py-2 font-normal">Kural</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/kampanyalar/${campaign.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {campaign.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {campaign.program.bank.name} · {campaign.program.name}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {dateFormat.format(campaign.endsAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Confidence value={campaign.confidence} />
                  </td>
                  <td className="px-3 py-2">
                    {campaign.uncertainFields.length > 0 ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">
                        {campaign.uncertainFields.length}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{campaign._count.rules}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Yetki kontrolü sayfanın kendisinde: içerik build sırasında önceden üretilmez (ADR 0006). */
export default function Page(props: PageProps<"/admin/kampanyalar">) {
  return (
    <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
      <ReviewQueue {...props} />
    </Suspense>
  );
}
