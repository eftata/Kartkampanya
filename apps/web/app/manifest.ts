import type { MetadataRoute } from "next";

/** Ana ekrana eklenebilir uygulama (PWA; ADR 0031). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KartPlan — Kart kampanyalarından en çok kazan",
    short_name: "KartPlan",
    description: "Hangi harcamayı hangi kartla yapacağını gösteren aylık plan.",
    lang: "tr",
    dir: "ltr",
    start_url: "/plan",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    categories: ["finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Planım", url: "/plan" },
      { name: "Hangi kart?", url: "/hesapla" },
      { name: "Harcama ekle", url: "/harcamalar" },
    ],
  };
}
