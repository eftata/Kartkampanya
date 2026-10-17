import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { monthLabel, PlanView } from "@/components/plan-view";
import { RecomputePlanButton } from "@/components/recompute-plan-button";
import { requireUser } from "@/lib/auth/session";
import { getMonthlyPlan } from "@/lib/plan";
import { hasSpendProfile } from "@/lib/spend-profile";
import { countUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Bu ayın planı" };

const computedFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

async function PlanContent() {
  const user = await requireUser();
  // Onboarding tamamlanmadan plan çıkmaz: önce kartlar, sonra harcama profili.
  if ((await countUserCards(user.id)) === 0) redirect("/baslangic");
  if (!(await hasSpendProfile(user.id))) redirect("/baslangic/harcama");

  const result = await getMonthlyPlan(user.id);
  if (result.status === "incomplete") redirect("/baslangic");
  if (result.status === "error") {
    return (
      <p role="alert" className="rounded-xl border p-6 text-sm">
        {result.error} Biraz sonra yeniden dene.
      </p>
    );
  }
  const { view } = result;
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        {monthLabel(view.month)} için harcamalarını kartlarına en çok kazandıracak biçimde dağıttık.
        Kartların, harcama profilin ya da kampanyalar değişince plan kendiliğinden güncellenir.
      </p>
      {view.stale && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          Bilgilerin değişti ama plan şu anda güncellenemedi; son hesaplanan plan gösteriliyor.
        </p>
      )}
      <PlanView view={view} />
      <p className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>Son hesaplama: {computedFormat.format(view.computedAt)}</span>
        <RecomputePlanButton />
      </p>
    </div>
  );
}

export default function PlanPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Bu ayın planı</h1>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <PlanContent />
      </Suspense>
    </div>
  );
}
