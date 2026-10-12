import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Kampanyalar" };

export default function MyCampaignsPage() {
  return (
    <PagePlaceholder
      title="Kampanyalar"
      description="Kartlarına ve harcama alanlarına uyan aktif kampanyalar"
      sprint={3}
    />
  );
}
