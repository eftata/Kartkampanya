import { describe, expect, it } from "vitest";

import { AdminCardUpdateInput, AdminProgramCreateInput } from "./admin-catalog";
import { EarnRateBps, formatBps, parsePercentInput } from "./rates";

describe("parsePercentInput", () => {
  it.each([
    ["0,5", 50],
    ["0.5", 50],
    ["%1,25", 125],
    ["2", 200],
    [" 0,05 ", 5],
    ["0", 0],
  ])("%s → %i bps", (input, bps) => expect(parsePercentInput(input)).toBe(bps));

  it("boş girdi undefined döner", () => expect(parsePercentInput("")).toBeUndefined());

  it.each(["abc", "0,125", "-1", "1,2,3", "1e2"])("%s geçersizdir", (input) =>
    expect(parsePercentInput(input)).toBeNull(),
  );
});

describe("formatBps", () => {
  it.each([
    [50, "%0,5"],
    [125, "%1,25"],
    [100, "%1"],
    [5, "%0,05"],
    [0, "%0"],
  ])("%i → %s", (bps, text) => expect(formatBps(bps)).toBe(text));

  it("parse ile tutarlıdır", () => {
    for (const bps of [0, 5, 50, 125, 999, 2000])
      expect(parsePercentInput(formatBps(bps))).toBe(bps);
  });
});

describe("admin katalog şemaları", () => {
  it("oran sınırları: 0–%20, tamsayı bps", () => {
    expect(EarnRateBps.safeParse(2000).success).toBe(true);
    expect(EarnRateBps.safeParse(2001).error?.issues[0]?.message).toMatch(/%20/);
    expect(EarnRateBps.safeParse(-1).success).toBe(false);
    expect(EarnRateBps.safeParse(12.5).success).toBe(false);
  });

  it("program: slug biçimi ve puan değeri", () => {
    const base = {
      bankId: "b",
      slug: "bonus",
      name: "Bonus",
      pointName: "Bonus",
      pointValueTL: "0,5",
    };
    expect(AdminProgramCreateInput.parse(base)).toMatchObject({
      pointValueTL: "0.5",
      pointValueVerified: false,
    });
    expect(AdminProgramCreateInput.safeParse({ ...base, slug: "Bonus Kart" }).success).toBe(false);
    expect(AdminProgramCreateInput.safeParse({ ...base, pointValueTL: "0" }).success).toBe(false);
    expect(AdminProgramCreateInput.safeParse({ ...base, pointValueTL: "1,23456" }).success).toBe(
      false,
    );
  });

  it("kart güncellemesi kısmi ve katıdır", () => {
    expect(AdminCardUpdateInput.parse({ baseRateBps: 50 })).toEqual({ baseRateBps: 50 });
    expect(AdminCardUpdateInput.safeParse({ programId: "x" }).success).toBe(false);
  });

  it("kategori oranlarında aynı kategori iki kez olamaz", () => {
    const result = AdminCardUpdateInput.safeParse({
      rates: [
        { categoryId: "c", rateBps: 50 },
        { categoryId: "c", rateBps: 100 },
      ],
    });
    expect(result.error?.issues[0]?.message).toMatch(/iki kez/);
  });
});
