import { describe, expect, it } from "vitest";
import { formatKurus, Kurus, kurusToTl, parseTlInput, tlToKurus } from "./money";

describe("money", () => {
  it("TL ile kuruş arasında çevirir", () => {
    expect(tlToKurus(665)).toBe(66500);
    expect(tlToKurus(0.1 + 0.2)).toBe(30);
    expect(kurusToTl(66500)).toBe(665);
  });

  it("kuruş yalnızca negatif olmayan tamsayıdır", () => {
    expect(Kurus.safeParse(100).success).toBe(true);
    expect(Kurus.safeParse(1.5).success).toBe(false);
    expect(Kurus.safeParse(-1).success).toBe(false);
  });
});

describe("parseTlInput", () => {
  it.each([
    ["50000", 5_000_000],
    ["50.000", 5_000_000],
    ["1.250,50", 125_050],
    ["1250,5", 125_050],
    [" 75.000 TL ", 7_500_000],
    ["₺100", 10_000],
  ])("%s → %i kuruş", (input, expected) => expect(parseTlInput(input)).toBe(expected));

  it("boş girdi undefined döner", () => expect(parseTlInput("  ")).toBeUndefined());

  it.each(["abc", "1,2,3", "12.34", "50.00", "-100", "1e5", "1.250.5"])("%s geçersizdir", (input) =>
    expect(parseTlInput(input)).toBeNull(),
  );
});

describe("formatKurus", () => {
  it("Türkçe para biçiminde gösterir", () => {
    expect(formatKurus(5_000_000)).toBe("₺50.000");
    expect(formatKurus(125_050)).toBe("₺1.250,50");
    expect(formatKurus(5)).toBe("₺0,05");
    expect(formatKurus(0)).toBe("₺0");
  });
});
