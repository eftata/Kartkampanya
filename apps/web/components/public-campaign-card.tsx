import Link from "next/link";

import { formatDay, Tag } from "@/components/campaign-card";
import { JOIN_METHOD_LABELS, REWARD_LABELS } from "@/lib/campaign-labels";
import type { PublicCampaign } from "@/lib/public-campaigns";

/** Herkese açık kampanya etiketleri (kişisel durum yok). */
export function PublicCampaignTags({ campaign }: { campaign: PublicCampaign }) {
  return (
    <ul aria-label="Etiketler" className="flex flex-wrap gap-1.5">
      {campaign.joinRequired && (
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

export function PublicCampaignCard({ campaign }: { campaign: PublicCampaign }) {
  return (
    <article
      aria-labelledby={`campaign-${campaign.id}`}
      className="bg-card space-y-3 rounded-xl border p-4"
    >
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">
          {campaign.bankName} · {campaign.programName}
        </p>
        <h2 id={`campaign-${campaign.id}`} className="font-semibold">
          <Link href={campaign.path} className="underline-offset-4 hover:underline">
            {campaign.title}
          </Link>
        </h2>
      </div>
      <PublicCampaignTags campaign={campaign} />
      {campaign.summary.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {campaign.summary.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
        <span>
          {formatDay(campaign.startsAt)} – {formatDay(campaign.endsAt)}
        </span>
        <span>
          {campaign.categoryNames.length ? campaign.categoryNames.join(", ") : "Tüm harcamalar"}
        </span>
      </p>
    </article>
  );
}
