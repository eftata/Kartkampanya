import { describe, expect, it } from "vitest";

import { AddUserCardInput, looksLikeCardNumber } from "./cards";

describe("looksLikeCardNumber", () => {
  it.each([
    "4111111111111111",
    "4111 1111 1111 1111",
    "4111-1111-1111-1111",
    "kartım 5500.0000.0000.0004",
    "3782 822463 10005", // 15 hane (Amex)
  ])("%s kart numarasıdır", (value) => expect(looksLikeCardNumber(value)).toBe(true));

  it.each(["Maaş kartım", "İş kartı 2", "Bonus 2026", "05321234567", "123 456 789 012"])(
    "%s kart numarası değildir",
    (value) => expect(looksLikeCardNumber(value)).toBe(false),
  );
});

describe("AddUserCardInput", () => {
  it("yalnızca kart seçimiyle geçerlidir", () => {
    expect(AddUserCardInput.parse({ cardProductId: "c1" })).toEqual({ cardProductId: "c1" });
  });

  it("opsiyonel alanları kabul eder ve boş adı yok sayar", () => {
    expect(
      AddUserCardInput.parse({
        cardProductId: "c1",
        nickname: "  ",
        limitKurus: 5_000_000,
        statementDay: 15,
      }),
    ).toEqual({ cardProductId: "c1", limitKurus: 5_000_000, statementDay: 15 });
  });

  it("takma adda kart numarasını reddeder", () => {
    const result = AddUserCardInput.safeParse({
      cardProductId: "c1",
      nickname: "4111 1111 1111 1111",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Kart numarası girmeyin/);
  });

  it.each([
    [{ statementDay: 0 }, /1–31/],
    [{ statementDay: 32 }, /1–31/],
    [{ statementDay: 1.5 }, /./],
    [{ limitKurus: 0 }, /sıfırdan büyük/],
    [{ limitKurus: -100 }, /./],
    [{ limitKurus: 1_000_000_001 }, /çok yüksek/],
    [{ nickname: "x".repeat(41) }, /40 karakter/],
  ])("%o geçersizdir", (extra, message) => {
    const result = AddUserCardInput.safeParse({ cardProductId: "c1", ...extra });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(message);
  });
});
