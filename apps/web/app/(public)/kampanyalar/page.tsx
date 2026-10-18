import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PublicCampaignCard } from "@/components/public-campaign-card";
import { PublicCampaignFilters } from "@/components/public-campaign-filters";
import { Button } from "@/components/ui/button";
import { parsePublicFilters } from "@/lib/campaign-filters";
import { getPublicCampaigns } from "@/lib/public-campaigns";

export const metadata: Metadata = {
  title: "Güncel kredi kartı kampanyaları",
  description:
    "Bankaların güncel kredi kartı kampanyaları tek yerde: koşullar sade Türkçe, bitiş tarihleri ve katılım yöntemleriyle.",
  // Filtreli sayfalar ayrı sayfa sayılmasın.
  alternates: { canonical: "/kampanyalar" },
};

async function CampaignList({
  searchParams,
}: {
  searchParams: PageProps<"/kampanyalar">["searchParams"];
}) {
  const values = parsePublicFilters(await searchParams);
  await connection(); // "bugün" istek anında hesaplanır
  const { campaigns, programs, categories } = await getPublicCampaigns({
    ...(values.program ? { program: values.program } : {}),
    ...(values.kategori ? { category: values.kategori } : {}),
  });
  const filtered = Boolean(values.program || values.kategori);
  return (
    <div className="space-y-6">
      <PublicCampaignFilters programs={programs} categories={categories} values={values} />
      {campaigns.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border p-6 text-sm">
          {filtered
            ? "Bu filtrelere uyan güncel kampanya yok."
            : "Şu anda yayında kampanya yok. Yakında burada olacak."}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">{campaigns.length} kampanya</p>
          <div className="grid gap-4 md:grid-cols-2">
            {campaigns.map((campaign) => (
              <PublicCampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicCampaignsPage({ searchParams }: PageProps<"/kampanyalar">) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Güncel kart kampanyaları</h1>
        <p className="text-muted-foreground max-w-2xl">
          Bankaların kampanyalarını ekibimiz kontrol edip sade Türkçe özetliyor. Hangilerinin senin
          kartlarına uyduğunu ve ayda ne kazandıracağını görmek için planını oluştur.
        </p>
        <Button asChild size="sm">
          <Link href="/giris">Planımı oluştur</Link>
        </Button>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <CampaignList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
