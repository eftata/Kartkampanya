import { formatKurus } from "@kartplan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CampaignTags, formatDay } from "@/components/campaign-card";
import { JoinToggle } from "@/components/join-toggle";
import { requireUser } from "@/lib/auth/session";
import { describeRule } from "@/lib/campaign-describe";
import { JOIN_METHOD_LABELS } from "@/lib/campaign-labels";
import { daysBetween, turkeyToday } from "@/lib/campaign-match";
import { getMyCampaignDetail } from "@/lib/campaigns";

export const metadata: Metadata = { title: "Kampanya" };

const seenFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "long",
  timeZone: "Europe/Istanbul",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2 rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

async function CampaignDetail({ params }: PageProps<"/kampanyalarim/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const today = turkeyToday();
  const detail = await getMyCampaignDetail(user.id, id, today);
  if (!detail) notFound();
  const { matches, expired, rules, scopeCards, lastSeenAt } = detail;
  // Süresi dolmuş kampanyada "bitmek üzere" anlamsız.
  const campaign = expired ? { ...detail.campaign, endingSoon: false } : detail.campaign;
  // Kısa özet yoksa (eski kayıt) kuralların sade hali özet olur.
  const summary = campaign.summary.length
    ? campaign.summary.slice(0, 3)
    : rules.slice(0, 3).map((rule) => describeRule(rule).headline);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/kampanyalarim" className="text-muted-foreground text-sm underline">
          ← Kampanyalar
        </Link>
        <p className="text-muted-foreground text-sm">
          {campaign.bankName} · {campaign.programName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <CampaignTags campaign={campaign} />
      </div>

      {expired && (
        <p role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
          Bu kampanyanın süresi doldu.
        </p>
      )}
      {!expired && !matches && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          Bu kampanya kartlarına ya da harcama alanlarına uymuyor; listende bu yüzden görünmüyor.
        </p>
      )}

      <Section title="Özet">
        <ul className="list-disc space-y-1 pl-5">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section title="Koşullar">
        <ol className="space-y-3">
          {rules.map((rule) => {
            const text = describeRule(rule);
            return (
              <li key={rule.id} className="space-y-0.5">
                <p className="font-medium">{text.headline}</p>
                <ul className="text-muted-foreground text-sm">
                  {text.details.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground text-sm">
          Geçerli kartlar:{" "}
          {scopeCards.length
            ? scopeCards.join(", ")
            : `${campaign.programName} programındaki tüm kartlar`}
        </p>
      </Section>

      <Section title="Tarihler ve katılım">
        <p className="text-sm">
          {formatDay(campaign.startsAt)} – {formatDay(campaign.endsAt)}
          {!expired && !campaign.upcoming && ` · ${daysBetween(today, campaign.endsAt)} gün kaldı`}
        </p>
        <p className="text-sm">
          {campaign.joinRequired
            ? `Katılım: ${JOIN_METHOD_LABELS[campaign.joinMethod]}` +
              (campaign.joinDeadline ? ` · son gün ${formatDay(campaign.joinDeadline)}` : "")
            : "Katılım gerekmez, otomatik."}
        </p>
        {campaign.joinRequired && !expired && (
          <JoinToggle
            key={String(campaign.joined)}
            campaignId={campaign.id}
            joined={campaign.joined}
          />
        )}
      </Section>

      {matches && (
        <Section title="Senin için">
          <p className="text-sm">Kartların: {campaign.cards.map((card) => card.name).join(", ")}</p>
          <p className="text-sm">
            Harcama alanların: {campaign.categories.map((category) => category.name).join(", ")}
          </p>
          {campaign.estimateKurus > 0 && (
            <p className="text-sm">
              Tahmini kazanç: <strong>~{formatKurus(campaign.estimateKurus)}</strong>{" "}
              <span className="text-muted-foreground">
                (kalan sürede, profilindeki aylık harcamayı yalnızca bu kampanyaya yaptığını
                varsayan kaba hesap)
              </span>
            </p>
          )}
        </Section>
      )}

      <Section title="Kaynak">
        <a
          href={campaign.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-sm font-medium underline underline-offset-4"
        >
          Bankanın kampanya sayfası
          <span className="sr-only"> (yeni sekmede açılır)</span>
        </a>
        <p className="text-muted-foreground text-xs">
          Bilgiler bankanın sayfasından alındı ve ekibimizce kontrol edildi; sayfa en son{" "}
          {seenFormat.format(lastSeenAt)} tarihinde görüldü. Kesin koşullar için bankanın sayfası
          geçerlidir.
        </p>
        <Link
          href={`/geri-bildirim?kampanya=${campaign.id}&sayfa=${encodeURIComponent(`/kampanyalarim/${campaign.id}`)}`}
          className="text-sm underline"
        >
          Bu kampanyada yanlış bir bilgi mi var? Bize bildir
        </Link>
      </Section>
    </div>
  );
}

export default function CampaignDetailPage(props: PageProps<"/kampanyalarim/[id]">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <CampaignDetail {...props} />
    </Suspense>
  );
}
