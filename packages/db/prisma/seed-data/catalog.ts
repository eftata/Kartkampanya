// Sprint 1 başlangıç kataloğu. Kart adları ve puan birimleri genel bilgiden derlenmiştir; hiçbiri
// banka kaynağından doğrulanmadı. Bu yüzden seed tüm kayıtları "doğrulanmadı" bırakır
// (Program.pointValueVerifiedAt / CardProduct.ratesVerifiedAt = null) ve admin panelinden
// kaynak kontrolüyle doğrulanır.
//
// Oranlar bilinçli olarak 0'dır: doğrulanmamış bir oran planda kazancı olduğundan yüksek
// göstermesin. Kategoriye özel oran (EarnRate) uydurulmaz; doğrulandıkça admin ekler.

export type SeedCardType = "CREDIT" | "DEBIT" | "VIRTUAL";

export type SeedProgram = {
  bank: string;
  slug: string;
  name: string;
  pointName: string;
  /** 1 puanın TL karşılığı (tahmini). */
  pointValueTL: string;
  cards: { name: string; type: SeedCardType }[];
};

export type SeedCategory = { slug: string; name: string; merchants: string[] };

/** Doğrulanana kadar tüm kartlara uygulanan temel oran (baz puan). */
export const UNVERIFIED_BASE_RATE_BPS = 0;

export const PROGRAMS: SeedProgram[] = [
  {
    bank: "Garanti BBVA",
    slug: "bonus",
    name: "Bonus",
    pointName: "Bonus",
    pointValueTL: "1",
    cards: [
      { name: "Bonus Card", type: "CREDIT" },
      { name: "Bonus Gold", type: "CREDIT" },
      { name: "Bonus Platinum", type: "CREDIT" },
      { name: "Bonus Genç", type: "CREDIT" },
    ],
  },
  {
    bank: "Türkiye İş Bankası",
    slug: "maximum",
    name: "Maximum",
    pointName: "MaxiPuan",
    pointValueTL: "1",
    cards: [
      { name: "Maximum Kart", type: "CREDIT" },
      { name: "Maximum Gold", type: "CREDIT" },
      { name: "Maximum Platinum", type: "CREDIT" },
      { name: "Maximum Genç", type: "CREDIT" },
    ],
  },
  {
    bank: "Yapı Kredi",
    slug: "world",
    name: "World",
    pointName: "Worldpuan",
    pointValueTL: "1",
    cards: [
      { name: "Worldcard", type: "CREDIT" },
      { name: "Worldcard Gold", type: "CREDIT" },
      { name: "Worldcard Platinum", type: "CREDIT" },
      { name: "Play", type: "CREDIT" },
    ],
  },
  {
    bank: "Akbank",
    slug: "axess",
    name: "Axess",
    pointName: "chip-para",
    pointValueTL: "1",
    cards: [
      { name: "Axess", type: "CREDIT" },
      { name: "Axess Gold", type: "CREDIT" },
      { name: "Axess Platinum", type: "CREDIT" },
    ],
  },
  {
    bank: "Halkbank",
    slug: "paraf",
    name: "Paraf",
    pointName: "ParafPara",
    pointValueTL: "1",
    cards: [
      { name: "Paraf", type: "CREDIT" },
      { name: "Paraf Gold", type: "CREDIT" },
      { name: "Paraf Platinum", type: "CREDIT" },
    ],
  },
];

export const CATEGORIES: SeedCategory[] = [
  {
    slug: "market",
    name: "Market",
    merchants: ["Migros", "CarrefourSA", "A101", "BİM", "ŞOK"],
  },
  {
    slug: "akaryakit",
    name: "Akaryakıt",
    merchants: ["Opet", "Shell", "Petrol Ofisi", "BP", "TotalEnergies"],
  },
  {
    slug: "e-ticaret",
    name: "E-ticaret",
    merchants: ["Trendyol", "Hepsiburada", "Amazon Türkiye", "n11", "Çiçeksepeti"],
  },
  {
    slug: "restoran",
    name: "Restoran ve kafe",
    merchants: ["Yemeksepeti", "Starbucks", "Burger King", "Domino's", "Simit Sarayı"],
  },
  {
    slug: "giyim",
    name: "Giyim",
    merchants: ["LC Waikiki", "Koton", "DeFacto", "Zara", "Mavi"],
  },
  {
    slug: "seyahat",
    name: "Seyahat",
    merchants: ["Türk Hava Yolları", "Pegasus", "AJet", "Obilet", "Enuygun"],
  },
];
