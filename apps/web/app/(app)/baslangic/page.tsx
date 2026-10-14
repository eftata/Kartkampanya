import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth/session";
import { getCatalogBanks } from "@/lib/catalog";
import { listUserCards } from "@/lib/user-cards";

import { CardWizard } from "./card-wizard";

export const metadata: Metadata = { title: "Kartlarını ekle" };

async function OnboardingWizard() {
  const user = await requireUser();
  const [banks, cards] = await Promise.all([getCatalogBanks(), listUserCards(user.id)]);
  return <CardWizard banks={banks} initialCards={cards} />;
}

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">Adım 1 / 2</p>
        <h1 className="text-2xl font-semibold tracking-tight">Kartlarını ekle</h1>
        <p className="text-muted-foreground">
          Hangi kartlara sahip olduğunu seç; sana uyan kampanyaları ve planı buna göre çıkaralım.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <OnboardingWizard />
      </Suspense>
    </div>
  );
}
