import { describe, expect, it } from "vitest";

import { foldText, suggestMerchant } from "./statement-match";

const merchants = [
  { id: "migros", name: "Migros", categoryId: "market" },
  { id: "sok", name: "Şok", categoryId: "market" },
  { id: "a101", name: "A101", categoryId: "market" },
  { id: "opet", name: "Opet", categoryId: "akaryakit" },
  { id: "bk", name: "Burger King", categoryId: "restoran" },
  { id: "dominos", name: "Domino's", categoryId: "restoran" },
];

describe("suggestMerchant", () => {
  it.each([
    ["MIGROS KADIKOY ISTANBUL", "migros"],
    ["SOK MARKET 1234", "sok"],
    ["A101 YENI MAGAZACILIK", "a101"],
    ["OPET PETROLCULUK A.S.", "opet"],
    ["BURGER KING ATASEHIR", "bk"],
    ["DOMINOS PIZZA", "dominos"], // kesme işareti yok sayılır
    ["SOKAK LEZZETLERI", null],
    ["BILINMEYEN ISYERI", null],
  ])("%s → %s", (description, expected) =>
    expect(suggestMerchant(description, merchants)?.id ?? null).toBe(expected),
  );

  it("en uzun eşleşme kazanır", () =>
    expect(
      suggestMerchant("MIGROS JET", [
        ...merchants,
        { id: "jet", name: "Migros Jet", categoryId: "market" },
      ])?.id,
    ).toBe("jet"));

  it("foldText Türkçe harfleri sadeleştirir", () =>
    expect(foldText("ŞOK Çağdaş İĞDE")).toBe(" sok cagdas igde "));
});
