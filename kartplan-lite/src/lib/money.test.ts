import { describe, expect, it } from "vitest";
import {
  applyBps,
  formatKurus,
  kurusToInput,
  looksLikeCardNumber,
  parsePercentInput,
  parseTlInput,
} from "./money";

describe("para", () => {
  it("TL girişini kuruşa çevirir", () => {
    expect(parseTlInput("1.234,56")).toBe(123456);
    expect(parseTlInput("1234")).toBe(123400);
    expect(parseTlInput("1234.5")).toBe(123450);
    expect(parseTlInput("2.500")).toBe(250000);
    expect(parseTlInput("₺ 75,5")).toBe(7550);
    expect(parseTlInput("abc")).toBeNull();
    expect(parseTlInput("")).toBeNull();
    expect(parseTlInput("1,234")).toBeNull();
  });

  it("kuruşu Türkçe biçimler", () => {
    expect(formatKurus(123456)).toBe("1.234,56 ₺");
    expect(formatKurus(150000)).toBe("1.500 ₺");
    expect(formatKurus(5)).toBe("0,05 ₺");
    expect(kurusToInput(123450)).toBe("1234,5");
    expect(kurusToInput(150000)).toBe("1500");
  });

  it("yüzde ve oran", () => {
    expect(parsePercentInput("0,5")).toBe(50);
    expect(parsePercentInput("%10")).toBe(1000);
    expect(parsePercentInput("101")).toBeNull();
    expect(applyBps(10_000, 50)).toBe(50);
    expect(applyBps(999, 50)).toBe(4);
  });

  it("kart numarasını yakalar", () => {
    expect(looksLikeCardNumber("4111 1111 1111 1111")).toBe(true);
    expect(looksLikeCardNumber("4111-1111-1111-1111")).toBe(true);
    expect(looksLikeCardNumber("Bonus Gold 2024")).toBe(false);
  });
});
