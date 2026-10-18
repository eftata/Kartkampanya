import type { MyCampaignDto } from "@kartplan/shared";
import { formatKurus } from "@kartplan/shared";
import Link from "next/link";

import { JoinToggle } from "@/components/join-toggle";
import { daysBetween } from "@/lib/campaign-match";
import { JOIN_METHOD_LABELS, REWARD_LABELS } from "@/lib/campaign-labels";
import { cn } from "@/lib/utils";

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

export function Tag({
  tone,
  children,
}: {
  tone: "amber" | "red" | "blue" | "green";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "amber" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        tone === "red" && "bg-red-500/10 text-red-700 dark:text-red-400",
        tone === "blue" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "green" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {children}
    </span>
  );
}

/** Kampanya etiketleri: plana dahil, katılım, bitmek üzere, başlangıç, fayda tipleri. */
export function CampaignTags({ campaign }: { campaign: MyCampaignDto }) {
  return (
    <ul aria-label="Etiketler" className="flex flex-wrap gap-1.5">
      {campaign.inPlan && (
        <li>
          <Tag tone="green">Plana dahil</Tag>
        </li>
      )}
      {campaign.joinRequired && campaign.joined && (
        <li>
          <Tag tone="green">Katıldın</Tag>
        </li>
      )}
      {campaign.joinRequired && !campaign.joined && (
        <li>
          <Tag tone="amber">Katılım gerekli · {JOIN_METHOD_LABELS[campaign.joinMethod]}</Tag>
        </li>
      )}
      {campaign.endingSoon && (
        <li>
          <Tag tone="red">Bitmek üzere</Tag>
        </li>
      )}
      {campaign.upcoming && (
        <li>
          <Tag tone="blue">Başlangıç: {formatDay(campaign.startsAt)}</Tag>
        </li>
      )}
      {campaign.rewardTypes.map((type) => (
        <li key={type}>
          <span className="bg-muted rounded-full px-2 py-0.5 text-xs">{REWARD_LABELS[type]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Kampanya listesi öğesi: etiketler, tarih, sade özet, uyan kartlar ve kaynak bağlantısı. */
export function CampaignCard({ campaign, today }: { campaign: MyCampaignDto; today: string }) {
  const daysLeft = daysBetween(today, campaign.endsAt);
  const joinBy = campaign.joinDeadline ?? campaign.endsAt;
  return (
    <article
      aria-labelledby={`campaign-${campaign.id}`}
      className="bg-card space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            {campaign.bankName} · {campaign.programName}
          </p>
          <h2 id={`campaign-${campaign.id}`} className="font-semibold">
            <Link
              href={`/kampanyalarim/${campaign.id}`}
              className="underline-offset-4 hover:underline"
            >
              {campaign.title}
            </Link>
          </h2>
        </div>
        {campaign.estimateKurus > 0 && (
          <p
            className="text-right text-sm"
            title="Bu kampanyaya tek başına, profilindeki aylık harcamayla"
          >
            <span className="text-muted-foreground block text-xs">Tahmini</span>
            <span className="font-semibold">~{formatKurus(campaign.estimateKurus)}</span>
          </p>
        )}
      </div>

      <CampaignTags campaign={campaign} />

      {campaign.summary.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {campaign.summary.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {formatDay(campaign.startsAt)} – {formatDay(campaign.endsAt)}
          {!campaign.upcoming && ` · ${daysLeft} gün kaldı`}
          {campaign.joinRequired && campaign.joinDeadline && ` · son katılım ${formatDay(joinBy)}`}
        </span>
        <span>
          {campaign.cards.map((card) => card.name).join(", ")} ·{" "}
          {campaign.categories.map((category) => category.name).join(", ")}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={campaign.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-block text-sm font-medium underline underline-offset-4"
        >
          Bankanın kampanya sayfası
          <span className="sr-only"> (yeni sekmede açılır)</span>
        </a>
        {campaign.joinRequired && (
          <JoinToggle
            // Sunucudan yeni durum gelince (ör. başka sekmede değişti) düğme onu göstersin.
            key={String(campaign.joined)}
            campaignId={campaign.id}
            joined={campaign.joined}
          />
        )}
      </div>
    </article>
  );
}
