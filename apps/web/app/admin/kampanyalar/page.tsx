import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Onay kuyruğu" };

export default function ReviewQueuePage() {
  return (
    <PagePlaceholder
      title="Onay kuyruğu"
      description="Ham metin ile ayıklanan kurallar yan yana; düzenle, onayla veya reddet"
      sprint={2}
    />
  );
}
