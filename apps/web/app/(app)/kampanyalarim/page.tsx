import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignCard } from "@/components/campaign-card";
import { CampaignFilters } from "@/components/campaign-filters";
import { requireUser } from "@/lib/auth/session";
import { parseFilters } from "@/lib/campaign-filters";
import { turkeyToday } from "@/lib/campaign-match";
import { getMyCampaigns } from "@/lib/campaigns";
import { getSpendProfile } from "@/lib/spend-profile";
import { listUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Kampanyalar" };

async function CampaignList({ searchParams }: PageProps<"/kampanyalarim">) {
  const user = await requireUser();
  const { query, values } = parseFilters(await searchParams);
  const today = turkeyToday();
  const [cards, profile, campaigns] = await Promise.all([
    listUserCards(user.id),
    getSpendProfile(user.id),
    getMyCampaigns(user.id, query, today),
  ]);

  if (cards.length === 0 || profile.items.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-sm">
        <p className="font-medium">
          Sana uyan kampanyaları bulmak için kartların ve harcama alanların gerekli.
        </p>
        <p className="text-muted-foreground mt-1">
          {cards.length === 0 ? (
            <Link href="/baslangic" className="underline">
              Kartlarını ekle
            </Link>
          ) : (
            <Link href="/baslangic/harcama" className="underline">
              Harcama profilini doldur
            </Link>
          )}
        </p>
      </div>
    );
  }

  const filtered = Boolean(values.kart || values.kategori || values.tur);
  return (
    <div className="space-y-6">
      <CampaignFilters
        // Filtre değişince (ör. "temizle") seçimler URL'den yeniden okunsun.
        key={JSON.stringify(values)}
        values={values}
        cards={cards.map((card) => ({ id: card.id, name: card.nickname || card.cardName }))}
        categories={profile.items.map((item) => ({
          id: item.categoryId,
          name: item.categoryName,
        }))}
      />
      <p className="text-muted-foreground text-sm" role="status">
        {campaigns.length} kampanya
      </p>
      {campaigns.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border p-6 text-center text-sm">
          {filtered
            ? "Bu filtrelere uyan aktif kampanya yok."
            : "Şu an kartlarına ve harcama alanlarına uyan aktif kampanya yok. Yeni kampanyalar her gün eklenir."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} today={today} />
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Tahmini kazanç kaba bir hesaptır: kampanyanın kalan süresinde, profilindeki aylık harcamayı
        yalnızca o kampanyaya yaptığını varsayar. Harcamanın kartlara en iyi dağılımı planda.
      </p>
    </div>
  );
}

export default function MyCampaignsPage(props: PageProps<"/kampanyalarim">) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kampanyalar</h1>
        <p className="text-muted-foreground">
          Kartlarına ve harcama alanlarına uyan, bankanın onaylı ve süresi dolmamış kampanyaları.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <CampaignList {...props} />
      </Suspense>
    </div>
  );
}
