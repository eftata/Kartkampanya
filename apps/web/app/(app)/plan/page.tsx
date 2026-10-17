import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { monthLabel, PlanView } from "@/components/plan-view";
import { requireUser } from "@/lib/auth/session";
import { getMonthlyPlan } from "@/lib/plan";
import { hasSpendProfile } from "@/lib/spend-profile";
import { countUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Bu ayın planı" };

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
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        {monthLabel(result.view.month)} için harcamalarını kartlarına en çok kazandıracak biçimde
        dağıttık.
      </p>
      <PlanView view={result.view} />
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
