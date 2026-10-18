/**
 * Sitenin kök adresi (kanonik bağlantılar, sitemap, robots, Open Graph). `APP_URL` yoksa yerel
 * geliştirme adresi. Kök layout'un `metadataBase`'i bunu build'de okur (turbo.json → build.env).
 */
export function siteUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Arama motorlarına kapalı yollar: kişisel sayfalar, admin, API, giriş/onay akışları. */
export const NON_INDEXED_PATHS = [
  "/api/",
  "/admin",
  "/plan",
  "/baslangic",
  "/kartlarim",
  "/kampanyalarim",
  "/profil",
  "/onay",
  "/giris",
  "/abonelik",
] as const;
