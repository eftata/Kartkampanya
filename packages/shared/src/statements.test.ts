import { describe, expect, it } from "vitest";

import { StatementImportInput, StatementParseResult } from "./statements";

describe("ekstre şemaları", () => {
  it("motor yanıtı", () =>
    expect(
      StatementParseResult.safeParse({
        parser: "genel",
        pages: 1,
        rows: [
          { date: "2026-11-05", description: "MIGROS", amountKurus: 45_000, installment: null },
        ],
        skippedCredits: 2,
        unparsedLines: 0,
      }).success,
    ).toBe(true));

  it("içe aktarma: açıklama kabul edilmez, boş liste reddedilir", () => {
    const row = { date: "2026-11-05", amountKurus: 45_000, categoryId: "m", merchantId: null };
    expect(StatementImportInput.safeParse({ userCardId: "c", rows: [row] }).success).toBe(true);
    expect(
      StatementImportInput.safeParse({ userCardId: "c", rows: [{ ...row, description: "x" }] })
        .success,
    ).toBe(false);
    expect(
      StatementImportInput.safeParse({ userCardId: "c", rows: [] }).error?.issues[0]?.message,
    ).toBe("En az bir satır seç.");
  });
});
