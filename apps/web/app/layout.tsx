import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { ServiceWorker } from "@/components/service-worker";
import { siteUrl } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "KartPlan — Kart kampanyalarından en çok kazan",
    template: "%s · KartPlan",
  },
  description:
    "Kartlarını ve aylık harcamanı gir; hangi harcamayı hangi kartla yapacağını gösteren aylık planı al.",
  openGraph: { siteName: "KartPlan", locale: "tr_TR", type: "website" },
  // Ana ekrana eklenince (PWA; manifest `app/manifest.ts`).
  appleWebApp: { capable: true, title: "KartPlan", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#171717" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
