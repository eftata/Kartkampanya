import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AuditList } from "@/components/admin/audit-list";
import { CampaignReviewForm } from "@/components/admin/campaign-review-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditLog } from "@/lib/admin-audit";
import {
  findSimilarCampaigns,
  getAdminCampaign,
  getRuleOptions,
  ruleInput,
  toDay,
} from "@/lib/admin-campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/admin-labels";
import { requireAdmin } from "@/lib/auth/session";
import { ruleToDraft } from "@/lib/campaign-draft";
import { getOpenCampaignReports } from "@/lib/feedback";
import type { CampaignDraft } from "@/lib/campaign-draft";

async function CampaignReview({ params }: PageProps<"/admin/kampanyalar/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [campaign, options, history, reports] = await Promise.all([
    getAdminCampaign(id),
    getRuleOptions(),
    getAuditLog({ entityType: "Campaign", entityId: id }, 10),
    getOpenCampaignReports(id),
  ]);
  if (!campaign) notFound();
  const similar = await findSimilarCampaigns(campaign);

  const draft: CampaignDraft = {
    title: campaign.title,
    summary: [0, 1, 2].map((index) => campaign.summary[index] ?? ""),
    startsAt: toDay(campaign.startsAt),
    endsAt: toDay(campaign.endsAt),
    joinMethod: campaign.joinMethod,
    joinDeadline: campaign.joinDeadline ? toDay(campaign.joinDeadline) : "",
    cardIds: campaign.cardScope.map((card) => card.cardProductId),
    rules: campaign.rules.map((rule) => ruleToDraft(ruleInput(rule))),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/admin/kampanyalar" className="text-muted-foreground text-sm underline">
          ← Onay kuyruğu
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          <span data-testid="campaign-status">{CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
          <span>
            {campaign.program.bank.name} · {campaign.program.name}
          </span>
          {campaign.confidence !== null && (
            <span>LLM güveni %{Math.round(campaign.confidence * 100)}</span>
          )}
          <a
            href={campaign.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline"
          >
            Kaynak sayfa
          </a>
        </p>
      </div>

      {reports.length > 0 && (
        <section
          aria-label="Hata bildirimleri"
          className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm"
        >
          <p className="font-medium">
            Kullanıcılar bu kampanyada {reports.length} hata bildirdi (açık)
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {reports.map((report) => (
              <li key={report.id} className="whitespace-pre-wrap">
                {report.message}
              </li>
            ))}
          </ul>
          <Link href="/admin/geri-bildirim" className="underline">
            Geri bildirimlerde aç
          </Link>
        </section>
      )}
      {similar.length > 0 && (
        <section
          aria-label="Benzer kampanyalar"
          className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <p className="font-medium">
            Mükerrer olabilir: aynı programda, tarihi çakışan benzer başlıklar
          </p>
          <ul className="space-y-0.5">
            {similar.map((other) => (
              <li key={other.id}>
                <Link href={`/admin/kampanyalar/${other.id}`} className="underline">
                  {other.title}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {CAMPAIGN_STATUS_LABELS[other.status]} · {toDay(other.startsAt)} –{" "}
                  {toDay(other.endsAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Ham metin</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              data-testid="raw-text"
              className="bg-muted/40 max-h-[70vh] overflow-y-auto rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap"
            >
              {campaign.rawText}
            </div>
          </CardContent>
        </Card>

        <CampaignReviewForm
          campaignId={campaign.id}
          status={campaign.status}
          initial={draft}
          uncertainFields={campaign.uncertainFields}
          cards={campaign.program.cards}
          categories={options}
        />
      </div>

      <AuditList entries={history} title="Kampanyanın işlem geçmişi" />
    </div>
  );
}

/** Yetki kontrolü sayfanın kendisinde: içerik build sırasında önceden üretilmez (ADR 0006). */
export default function Page(props: PageProps<"/admin/kampanyalar/[id]">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <CampaignReview {...props} />
    </Suspense>
  );
}
