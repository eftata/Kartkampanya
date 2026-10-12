import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Kartlarım" };

export default function MyCardsPage() {
  return (
    <PagePlaceholder
      title="Kartlarım"
      description="Banka → program → kart seçimi; opsiyonel limit ve kesim günü"
      sprint={1}
    />
  );
}
