import type { CampaignCategory, CategorySlug } from "./types";

export const CATEGORIES: { slug: CategorySlug; name: string; icon: string; hint: string }[] = [
  { slug: "market", name: "Market", icon: "🛒", hint: "Migros, A101, BİM, ŞOK…" },
  { slug: "akaryakit", name: "Akaryakıt", icon: "⛽", hint: "Opet, Shell, Petrol Ofisi…" },
  { slug: "e-ticaret", name: "E-ticaret", icon: "📦", hint: "Trendyol, Hepsiburada, Amazon…" },
  { slug: "restoran", name: "Restoran ve kafe", icon: "🍽", hint: "Yemeksepeti, kafeler…" },
  { slug: "giyim", name: "Giyim", icon: "👕", hint: "LC Waikiki, Koton, Zara…" },
  { slug: "seyahat", name: "Seyahat", icon: "✈", hint: "THY, Pegasus, otobüs…" },
  { slug: "elektronik", name: "Elektronik", icon: "🎧", hint: "Teknosa, MediaMarkt…" },
  { slug: "fatura", name: "Fatura ve abonelik", icon: "🧾", hint: "Elektrik, internet, dijital…" },
];

export function categoryName(slug: CampaignCategory): string {
  if (slug === "tumu") return "Tüm harcamalar";
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}

export function categoryIcon(slug: CampaignCategory): string {
  if (slug === "tumu") return "✦";
  return CATEGORIES.find((c) => c.slug === slug)?.icon ?? "•";
}

export const BENEFIT_LABEL = { puan: "Puan", iade: "Nakit iade", indirim: "İndirim" } as const;
