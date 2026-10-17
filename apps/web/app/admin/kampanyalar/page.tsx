import { Suspense } from "react";

import { PagePlaceholder } from "@/components/page-placeholder";
import { requireAdmin } from "@/lib/auth/session";

async function ReviewQueue() {
  await requireAdmin();
  return (
    <PagePlaceholder
      title="Onay kuyruğu"
      description="Ham metin ile ayıklanan kurallar yan yana; düzenle, onayla veya reddet"
      sprint={2}
    />
  );
}

/** Yetki kontrolü sayfanın kendisinde: içerik build sırasında önceden üretilmez (ADR 0006). */
export default function Page() {
  return (
    <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
      <ReviewQueue />
    </Suspense>
  );
}
