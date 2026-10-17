import type { CampaignSort, MyCampaignsQuery, RewardType } from "@kartplan/shared";

/** Kampanyalar sayfasının URL parametreleri (Türkçe) ↔ `MyCampaignsQuery`. */
export type CampaignFilterParams = { kart: string; kategori: string; tur: string; sirala: string };

export const REWARD_SLUGS: Record<string, RewardType> = {
  puan: "POINTS",
  iade: "CASHBACK",
  indirim: "DISCOUNT",
  taksit: "INSTALLMENT",
};
export const SORT_SLUGS: Record<string, CampaignSort> = { bitis: "ends", kazanc: "gain" };

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Bilinmeyen değerler yok sayılır (eski/bozuk bağlantı hata sayfası göstermesin). */
export function parseFilters(params: Record<string, string | string[] | undefined>): {
  query: MyCampaignsQuery;
  values: CampaignFilterParams;
} {
  const kart = first(params.kart);
  const kategori = first(params.kategori);
  const tur = first(params.tur) in REWARD_SLUGS ? first(params.tur) : "";
  const sirala = first(params.sirala) in SORT_SLUGS ? first(params.sirala) : "bitis";
  return {
    query: {
      ...(kart ? { card: kart } : {}),
      ...(kategori ? { category: kategori } : {}),
      ...(tur ? { type: REWARD_SLUGS[tur] } : {}),
      sort: SORT_SLUGS[sirala] ?? "ends",
    },
    values: { kart, kategori, tur, sirala },
  };
}
