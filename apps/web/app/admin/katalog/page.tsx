import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Katalog" };

export default function CatalogPage() {
  return (
    <PagePlaceholder
      title="Katalog"
      description="Banka, program, kart ve kazanç oranı yönetimi"
      sprint={1}
    />
  );
}
