import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { formatDay } from "@/components/campaign-card";
import { PublicCampaignTags } from "@/components/public-campaign-card";
import { Button } from "@/components/ui/button";
import { describeRule } from "@/lib/campaign-describe";
import { JOIN_METHOD_LABELS } from "@/lib/campaign-labels";
import { campaignIdFromParam } from "@/lib/campaign-slug";
import { getPublicCampaign } from "@/lib/public-campaigns";

const load = cache((id: string) => getPublicCampaign(id));

/**
 * Adres → kampanya. Yoksa 404; başlık (slug) güncel değilse kanonik adrese kalıcı yönlendirme.
 * Statik kabuk önce gönderildiği için durum kodu 200 kalır: Next yönlendirmeyi 0 sn'lik meta
 * refresh, 404'ü `noindex` olarak ekler (ADR 0020). Metadata da aynı kararı verir.
 */
async function resolve(params: PageProps<"/kampanyalar/[slug]">["params"]) {
  const { slug } = await params;
  await connection(); // "bugün" (süresi doldu mu) istek anında hesaplanır
  const id = campaignIdFromParam(slug);
  const detail = id ? await load(id) : null;
  if (!detail) notFound();
  if (`/kampanyalar/${slug}` !== detail.campaign.path) permanentRedirect(detail.campaign.path);
  return detail;
}

export async function generateMetadata({
  params,
}: PageProps<"/kampanyalar/[slug]">): Promise<Metadata> {
  const { campaign, expired } = await resolve(params);
  const description =
    campaign.summary.slice(0, 3).join(" ") ||
    `${campaign.bankName} ${campaign.programName} kampanyası: ${formatDay(campaign.startsAt)} – ${formatDay(campaign.endsAt)}.`;
  return {
    title: `${campaign.title} · ${campaign.programName}`,
    description,
    alternates: { canonical: campaign.path },
    openGraph: {
      type: "article",
      title: campaign.title,
      description,
      url: campaign.path,
      siteName: "KartPlan",
      locale: "tr_TR",
    },
    // Süresi dolan kampanya bağlantısı açılır ama arama sonuçlarından düşsün.
    ...(expired ? { robots: { index: false, follow: true } } : {}),
  };
}

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

async function CampaignDetail({ params }: PageProps<"/kampanyalar/[slug]">) {
  const { campaign, expired, joinClosed, rules, scopeCards, sourceUrl, lastSeenAt } =
    await resolve(params);
  const summary = campaign.summary.length
    ? campaign.summary.slice(0, 3)
    : rules.slice(0, 3).map((rule) => describeRule(rule).headline);
  const tags = expired ? { ...campaign, endingSoon: false } : campaign;

  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <Link href="/kampanyalar" className="text-muted-foreground text-sm underline">
          ← Tüm kampanyalar
        </Link>
        <p className="text-muted-foreground text-sm">
          {campaign.bankName} · {campaign.programName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <PublicCampaignTags campaign={tags} />
      </div>

      {expired ? (
        <p role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
          Bu kampanyanın süresi doldu.{" "}
          <Link href="/kampanyalar" className="underline">
            Güncel kampanyalara bak
          </Link>
        </p>
      ) : (
        joinClosed && (
          <p role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
            Bu kampanyanın katılım süresi doldu.
          </p>
        )
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
        </p>
        <p className="text-sm">
          {campaign.joinRequired
            ? `Katılım: ${JOIN_METHOD_LABELS[campaign.joinMethod]}` +
              (campaign.joinDeadline ? ` · son gün ${formatDay(campaign.joinDeadline)}` : "")
            : "Katılım gerekmez, otomatik."}
        </p>
      </Section>

      {!expired && (
        <section aria-label="Planına ekle" className="bg-muted/40 space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">Bu kampanya senin kartlarına uyuyor mu?</h2>
          <p className="text-muted-foreground text-sm">
            Kartlarını ve aylık harcamanı gir; hangi kampanyaların sana uyduğunu ve harcamalarını
            hangi kartla yaparsan en çok kazanacağını gösterelim. Kart numarası istemeyiz.
          </p>
          <Button asChild>
            <Link href="/giris">Planımı oluştur</Link>
          </Button>
        </section>
      )}

      <Section title="Kaynak">
        <a
          href={sourceUrl}
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
      </Section>
    </article>
  );
}

export default function PublicCampaignPage(props: PageProps<"/kampanyalar/[slug]">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <CampaignDetail {...props} />
    </Suspense>
  );
}
