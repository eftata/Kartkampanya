import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-muted-foreground text-sm">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Sayfa bulunamadı</h1>
      <p className="text-muted-foreground">Aradığın sayfa yok ya da taşınmış olabilir.</p>
      <Button asChild>
        <Link href="/">Ana sayfaya dön</Link>
      </Button>
    </main>
  );
}
