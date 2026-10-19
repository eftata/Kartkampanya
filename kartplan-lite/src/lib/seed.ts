// Başlangıç kataloğu (ana projedeki packages/db/prisma/seed-data/catalog.ts ile aynı).
// Kart adları genel bilgiden derlendi; hiçbiri banka kaynağından doğrulanmadı. Oranlar bilinçli
// olarak 0: doğrulanmamış oran planda kazancı şişirmesin. Admin panelinden doğrulanarak girilir.

import { monthBounds } from "./dates";
import type { Campaign, CatalogCard } from "./types";

type SeedProgram = { bank: string; slug: string; name: string; cards: string[] };

export const PROGRAMS: SeedProgram[] = [
  {
    bank: "Garanti BBVA",
    slug: "bonus",
    name: "Bonus",
    cards: ["Bonus Card", "Bonus Gold", "Bonus Platinum", "Bonus Genç"],
  },
  {
    bank: "Türkiye İş Bankası",
    slug: "maximum",
    name: "Maximum",
    cards: ["Maximum Kart", "Maximum Gold", "Maximum Platinum", "Maximum Genç"],
  },
  {
    bank: "Yapı Kredi",
    slug: "world",
    name: "World",
    cards: ["Worldcard", "Worldcard Gold", "Worldcard Platinum", "Play"],
  },
  {
    bank: "Akbank",
    slug: "axess",
    name: "Axess",
    cards: ["Axess", "Axess Gold", "Axess Platinum"],
  },
  {
    bank: "Halkbank",
    slug: "paraf",
    name: "Paraf",
    cards: ["Paraf", "Paraf Gold", "Paraf Platinum"],
  },
];

export function slugify(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const SEED_CARDS: CatalogCard[] = PROGRAMS.flatMap((p) =>
  p.cards.map((name) => ({
    id: slugify(name),
    bank: p.bank,
    program: p.slug,
    programName: p.name,
    name,
    baseRateBps: 0,
    verified: false,
  })),
);

/**
 * Arayüzü denemek için ÖRNEK kampanyalar (gerçek değil; `demo: true`, arayüzde "Örnek" etiketi).
 * Tarihler içinde bulunulan aya göre üretilir.
 */
export function demoCampaigns(today: string): Omit<Campaign, "id">[] {
  const { start, end } = monthBounds(today);
  const base = {
    summary: "",
    cardIds: [] as string[],
    joinHint: "",
    url: "",
    startsAt: start,
    endsAt: end,
    status: "yayinda" as const,
    demo: true,
    rateBps: 0,
    capKurus: 0,
    rewardKurus: 0,
  };
  return [
    {
      ...base,
      title: "Örnek: Markette 1.500 TL'ye 150 TL puan",
      summary: "Ay içinde market harcaman 1.500 TL'yi geçince tek seferlik 150 TL puan.",
      program: "bonus",
      category: "market",
      benefit: "puan",
      minSpendKurus: 150_000,
      rewardKind: "sabit",
      rewardKurus: 15_000,
      requiresJoin: true,
      joinHint: "Mobil uygulamadan “Katıl” de.",
    },
    {
      ...base,
      title: "Örnek: Akaryakıtta %5 iade (en fazla 100 TL)",
      program: "maximum",
      category: "akaryakit",
      benefit: "iade",
      minSpendKurus: 0,
      rewardKind: "oran",
      rateBps: 500,
      capKurus: 10_000,
      requiresJoin: false,
    },
    {
      ...base,
      title: "Örnek: E-ticarette 1.000 TL'ye 75 TL Worldpuan",
      program: "world",
      category: "e-ticaret",
      benefit: "puan",
      minSpendKurus: 100_000,
      rewardKind: "sabit",
      rewardKurus: 7_500,
      requiresJoin: true,
      joinHint: "SMS ile KATIL yazıp gönder.",
    },
    {
      ...base,
      title: "Örnek: Restoranda %10 chip-para (en fazla 60 TL)",
      program: "axess",
      category: "restoran",
      benefit: "puan",
      minSpendKurus: 20_000,
      rewardKind: "oran",
      rateBps: 1000,
      capKurus: 6_000,
      requiresJoin: false,
    },
    {
      ...base,
      title: "Örnek: Tüm harcamalarda 3.000 TL'ye 120 TL ParafPara",
      program: "paraf",
      category: "tumu",
      benefit: "puan",
      minSpendKurus: 300_000,
      rewardKind: "sabit",
      rewardKurus: 12_000,
      requiresJoin: true,
      joinHint: "Paraf Mobil → Kampanyalar → Katıl.",
    },
  ];
}
