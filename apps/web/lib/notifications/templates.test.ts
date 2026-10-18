import type { MyCampaignDto } from "@kartplan/shared";
import { describe, expect, it } from "vitest";

import { endingSoonEmail, joinReminderEmail, weeklySummaryEmail } from "./templates";

const links = {
  base: "https://kartplan.test",
  unsubscribe: (target: string) => `https://kartplan.test/abonelik?k=${target}`,
};

const campaign = (id: string, overrides: Partial<MyCampaignDto> = {}): MyCampaignDto => ({
  id,
  title: `Kampanya <${id}>`,
  summary: [],
  sourceUrl: "https://ornek-banka.test",
  bankName: "Garanti BBVA",
  programName: "Bonus",
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  joinMethod: "SMS",
  joinDeadline: "2026-11-20",
  cards: [],
  categories: [],
  rewardTypes: ["POINTS"],
  estimateKurus: 0,
  joinRequired: true,
  endingSoon: false,
  upcoming: false,
  joined: false,
  inPlan: false,
  ...overrides,
});

describe("bildirim e-postaları", () => {
  it("katılım hatırlatma: konu, katılım yolu, son gün, bağlantılar, HTML kaçışı", () => {
    const email = joinReminderEmail([campaign("a")], links);
    expect(email.subject).toBe('"Kampanya <a>" başladı: katılmayı unutma');
    expect(email.text).toContain("Garanti BBVA · SMS ile katılım · son gün 20 Kasım");
    expect(email.text).toContain("https://kartplan.test/kampanyalarim/a");
    expect(email.text).toContain(
      "Bu bildirimleri kapat: https://kartplan.test/abonelik?k=joinReminder",
    );
    expect(email.text).toContain("Tüm bildirimleri kapat: https://kartplan.test/abonelik?k=all");
    expect(email.html).toContain("Kampanya &#60;a&#62;");
    expect(email.html).not.toContain("<a>");
    expect(email.unsubscribe).toBe("joinReminder");
    expect(joinReminderEmail([campaign("a"), campaign("b")], links).subject).toBe(
      "2 kampanya başladı: katılmayı unutma",
    );
  });

  it("push: kısa metin, uygulama içi yol (tek kampanyada detay)", () => {
    expect(joinReminderEmail([campaign("a")], links).push).toEqual({
      title: "Katılmayı unutma",
      body: '"Kampanya <a>" başladı: katılmayı unutma',
      url: "/kampanyalarim/a",
      tag: "join",
    });
    expect(endingSoonEmail([campaign("a"), campaign("b")], "2026-11-28", links).push).toMatchObject(
      { body: "2 kampanyan bitmek üzere", url: "/kampanyalarim" },
    );
  });

  it("son günler: kalan gün ve bugün biten", () => {
    expect(
      endingSoonEmail([campaign("a", { endsAt: "2026-11-30" })], "2026-11-28", links).subject,
    ).toBe('"Kampanya <a>": 3 gün kaldı (30 Kasım)');
    expect(endingSoonEmail([campaign("a")], "2026-11-30", links).subject).toBe(
      '"Kampanya <a>": bugün bitiyor',
    );
    expect(endingSoonEmail([campaign("a")], "2026-11-30", links).text).toContain(
      "Gereksiz harcamaya teşvik etmeyiz",
    );
  });

  it("haftalık özet: toplam, tek kart farkı, dağılım ve katılım listesi", () => {
    const email = weeklySummaryEmail(
      {
        monthLabel: "Kasım 2026",
        totalKurus: 30_000,
        baselineKurus: 10_000,
        rows: [{ category: "Market", card: "Bonus Platinum", amountKurus: 600_000 }],
        toJoin: [{ id: "k1", title: "Markette puan" }],
      },
      links,
    );
    expect(email.subject).toBe("Bu haftanın planı: ₺300 beklenen kazanç");
    expect(email.text).toContain(
      "Kasım 2026 için beklenen kazanç ₺300; tek kartla ödesen ₺200 daha az kazanırdın.",
    );
    expect(email.text).toContain("• Market: Bonus Platinum (₺6.000)");
    expect(email.text).toContain("• Markette puan https://kartplan.test/kampanyalarim/k1");
    expect(email.text).toContain("Planın tamamı: https://kartplan.test/plan");
    expect(email.push).toMatchObject({ title: "Bu haftanın planı", url: "/plan" });
  });
});
