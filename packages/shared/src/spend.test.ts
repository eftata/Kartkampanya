import { describe, expect, it } from "vitest";

import { SpendProfileInput } from "./spend";

const item = (extra: object = {}) => ({ categoryId: "market", monthlyKurus: 600_000, ...extra });

describe("SpendProfileInput", () => {
  it("geçerli profili kabul eder, marka listesi varsayılan boştur", () => {
    expect(SpendProfileInput.parse({ items: [item()] })).toEqual({
      items: [{ categoryId: "market", monthlyKurus: 600_000, merchantIds: [] }],
    });
  });

  it.each([
    [{ items: [] }, /En az bir/],
    [{ items: [item(), item()] }, /iki kez gönderilmiş/],
    [{ items: [item({ monthlyKurus: 0 })] }, /aylık tutar gir/],
    [{ items: [item({ monthlyKurus: 50 })] }, /en az 1 TL/],
    [{ items: [item({ monthlyKurus: 100_000_001 })] }, /çok yüksek/],
    [{ items: [item({ monthlyKurus: 10.5 })] }, /./],
    [{ items: [item({ merchantIds: ["m1", "m1"] })] }, /iki kez seçilmiş/],
    [
      { items: [item({ merchantIds: Array.from({ length: 11 }, (_, i) => `m${i}`) })] },
      /en fazla 10/,
    ],
  ])("%o geçersizdir", (input, message) => {
    const result = SpendProfileInput.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(message);
  });
});
