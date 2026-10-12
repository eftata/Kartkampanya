import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Profilim" };

export default function ProfilePage() {
  return (
    <PagePlaceholder
      title="Profilim"
      description="Kategori başına aylık harcama ve tercih edilen markalar"
      sprint={1}
    />
  );
}
