import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PagePlaceholder } from "@/components/page-placeholder";
import { requireUser } from "@/lib/auth/session";
import { countUserCards } from "@/lib/user-cards";

export const metadata: Metadata = { title: "Bu ayın planı" };

async function PlanContent() {
  const user = await requireUser();
  // Kartı olmayan kullanıcı önce onboarding'i tamamlar.
  if ((await countUserCards(user.id)) === 0) redirect("/baslangic");
  return (
    <PagePlaceholder
      title="Bu ayın planı"
      description="Kategori başına kart, tutar ve kampanya; toplam beklenen kazanç"
      sprint={4}
    />
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
      <PlanContent />
    </Suspense>
  );
}
