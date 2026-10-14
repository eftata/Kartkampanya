import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "E-postanı kontrol et" };

export default function VerifyRequestPage() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">E-postanı kontrol et</CardTitle>
          <CardDescription>
            Sana bir giriş bağlantısı gönderdik. Bağlantı 24 saat geçerli ve tek kullanımlık.
            Gelmediyse spam klasörüne bak ya da{" "}
            <Link href="/giris" className="underline">
              yeniden dene
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
