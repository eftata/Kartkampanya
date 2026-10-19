export type CategorySlug =
  "market" | "akaryakit" | "e-ticaret" | "restoran" | "giyim" | "seyahat" | "elektronik" | "fatura";

export type CampaignCategory = CategorySlug | "tumu";

export type CatalogCard = {
  id: string;
  bank: string;
  program: string; // program slug: bonus, maximum ...
  programName: string;
  name: string;
  /** Her harcamada temel kazanç (baz puan). Doğrulanmadıysa 0. */
  baseRateBps: number;
  verified: boolean;
};

export type Benefit = "puan" | "iade" | "indirim";

export type Campaign = {
  id: string;
  title: string;
  summary: string;
  program: string;
  /** Boş = programdaki tüm kartlar. */
  cardIds: string[];
  category: CampaignCategory;
  benefit: Benefit;
  /** Kampanya döneminde bu karttan en az bu kadar harcama (kuruş). */
  minSpendKurus: number;
  rewardKind: "sabit" | "oran";
  /** sabit: eşiğe ulaşınca kazanılan tutar. */
  rewardKurus: number;
  /** oran: harcamanın yüzdesi (bps), capKurus üst limit (0 = limitsiz). */
  rateBps: number;
  capKurus: number;
  requiresJoin: boolean;
  joinHint: string;
  url: string;
  startsAt: string; // YYYY-MM-DD (dahil)
  endsAt: string; // YYYY-MM-DD (dahil)
  status: "yayinda" | "taslak";
  demo?: boolean;
};

export type SpendProfile = Partial<Record<CategorySlug, number>>;

export type UserDoc = {
  cardIds: string[];
  spend: SpendProfile;
  joined: Record<string, boolean>;
  onboarded: boolean;
  consentVersion: number;
};
