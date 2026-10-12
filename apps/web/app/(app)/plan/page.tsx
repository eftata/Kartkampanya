import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Bu ayın planı" };

export default function PlanPage() {
  return (
    <PagePlaceholder
      title="Bu ayın planı"
      description="Kategori başına kart, tutar ve kampanya; toplam beklenen kazanç"
      sprint={4}
    />
  );
}
