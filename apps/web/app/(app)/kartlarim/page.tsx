import type { Metadata } from "next";
import { Suspense } from "react";

import { CardManager } from "@/components/card-manager";
import { requireUser } from "@/lib/auth/session";
import { getCatalogBanks } from "@/lib/catalog";
import { listUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Kartlarım" };

async function MyCards() {
  const user = await requireUser();
  const [banks, cards] = await Promise.all([getCatalogBanks(), listUserCards(user.id)]);
  return <CardManager banks={banks} initialCards={cards} />;
}

export default function MyCardsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kartlarım</h1>
        <p className="text-muted-foreground">
          Kartlarını ekle, limit ve kesim günlerini güncelle. Plan bu bilgilere göre hesaplanır.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <MyCards />
      </Suspense>
    </div>
  );
}
