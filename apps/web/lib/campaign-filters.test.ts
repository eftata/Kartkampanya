import { describe, expect, it } from "vitest";

import { parseFilters, parsePublicFilters } from "./campaign-filters";

describe("parseFilters", () => {
  it("varsayılan: filtre yok, bitişe göre", () =>
    expect(parseFilters({})).toEqual({
      query: { sort: "ends" },
      values: { kart: "", kategori: "", tur: "", sirala: "bitis" },
    }));

  it("Türkçe parametreleri sorguya çevirir", () =>
    expect(
      parseFilters({ kart: "uc1", kategori: "c1", tur: "iade", sirala: "kazanc" }).query,
    ).toEqual({ card: "uc1", category: "c1", type: "CASHBACK", sort: "gain" }));

  it("bilinmeyen ve boş değerleri yok sayar", () =>
    expect(parseFilters({ kart: "", tur: "hediye", sirala: ["kazanc", "bitis"] })).toEqual({
      query: { sort: "gain" },
      values: { kart: "", kategori: "", tur: "", sirala: "kazanc" },
    }));
});

describe("parsePublicFilters", () => {
  it("geçerli slug'ları alır, ilk değeri kullanır", () =>
    expect(parsePublicFilters({ program: ["bonus", "world"], kategori: " market " })).toEqual({
      program: "bonus",
      kategori: "market",
    }));

  it("bozuk değerleri yok sayar", () =>
    expect(parsePublicFilters({ program: "Bonus Kart", kategori: "<script>" })).toEqual({
      program: "",
      kategori: "",
    }));
});
