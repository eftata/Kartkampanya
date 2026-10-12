import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Kampanyalar" };

export default function PublicCampaignsPage() {
  return (
    <PagePlaceholder
      title="Kampanyalar"
      description="Bankaların güncel kart kampanyaları, herkese açık ve aranabilir"
      sprint={5}
    />
  );
}
