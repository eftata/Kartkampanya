import { describe, expect, it } from "vitest";

import { TransactionInput } from "./transactions";

const base = { userCardId: "c1", categoryId: "market", amountKurus: 45_000, date: "2026-11-03" };

describe("TransactionInput", () => {
  it("marka isteğe bağlı", () =>
    expect(TransactionInput.parse(base)).toEqual({ ...base, merchantId: null }));

  it.each([
    [{ ...base, amountKurus: 0 }, "0'dan büyük"],
    [{ ...base, amountKurus: 100_000_001 }, "çok büyük"],
    [{ ...base, amountKurus: 12.5 }, ""],
    [{ ...base, date: "2026-02-30" }, "Geçersiz tarih"],
    [{ ...base, note: "x" }, ""],
  ])("reddedilir: %o", (input, message) => {
    const result = TransactionInput.safeParse(input);
    expect(result.success).toBe(false);
    if (message) expect(result.error?.issues[0]?.message).toContain(message);
  });
});
