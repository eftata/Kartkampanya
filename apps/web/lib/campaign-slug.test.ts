import { describe, expect, it } from "vitest";

import { campaignIdFromParam, campaignPath, slugify } from "./campaign-slug";

describe("slugify", () => {
  it("Türkçe harfleri sadeleştirir, noktalama ve boşlukları tireye çevirir", () => {
    expect(slugify("Market'te 500 TL'ye %10 İade!")).toBe("markette-500-tlye-10-iade");
    expect(slugify("ŞIK Ödül: Çiğ Güneş")).toBe("sik-odul-cig-gunes");
    expect(slugify("  --Akaryakıt   kampanyası--  ")).toBe("akaryakit-kampanyasi");
  });

  it("boş kalırsa 'kampanya', uzunsa kelime ortasında tire bırakmadan kısaltır", () => {
    expect(slugify("!!!")).toBe("kampanya");
    const long = slugify("çok ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("kampanya adresi", () => {
  it("adres ↔ id gidiş-dönüş", () => {
    const path = campaignPath({ id: "cmabc123xyz", title: "Bonus'la Market İadesi" });
    expect(path).toBe("/kampanyalar/bonusla-market-iadesi-cmabc123xyz");
    expect(campaignIdFromParam(path.split("/").pop() ?? "")).toBe("cmabc123xyz");
  });

  it("yalnızca id ya da bozuk değer", () => {
    expect(campaignIdFromParam("cmabc123xyz")).toBe("cmabc123xyz");
    expect(campaignIdFromParam("eski-baslik-cmabc123xyz")).toBe("cmabc123xyz");
    expect(campaignIdFromParam("bozuk-")).toBeNull();
    expect(campaignIdFromParam("x-ID_ÇÖP")).toBeNull();
  });
});
