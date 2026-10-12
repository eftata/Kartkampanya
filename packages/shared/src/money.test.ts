import { describe, expect, it } from "vitest";
import { Kurus, kurusToTl, tlToKurus } from "./money";

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
