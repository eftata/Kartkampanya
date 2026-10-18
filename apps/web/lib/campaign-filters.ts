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

/** Herkese açık `/kampanyalar` filtreleri: program ve ana kategori slug'ı. */
export type PublicFilterParams = { program: string; kategori: string };

const SLUG = /^[a-z0-9-]{1,60}$/;

export function parsePublicFilters(
  params: Record<string, string | string[] | undefined>,
): PublicFilterParams {
  const program = first(params.program);
  const kategori = first(params.kategori);
  return {
    program: SLUG.test(program) ? program : "",
    kategori: SLUG.test(kategori) ? kategori : "",
  };
}
