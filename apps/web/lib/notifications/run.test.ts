import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import type { PlanRequestInput } from "@kartplan/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Mail } from "@/lib/email/send";

import { unsubscribe } from "./prefs";
import { runNotifications } from "./run";
import { verifyUnsubscribe } from "./unsubscribe";

vi.mock("@/lib/engine", () => ({
  optimizePlan: (request: PlanRequestInput) =>
    Promise.resolve({
      ok: true,
      plan: {
        status: "OPTIMAL",
        allocations: request.budget.map((b) => ({
          category: b.category,
          card: request.cards[0]!.id,
          amount: b.amount,
          campaigns: [],
          expectedReward: 0,
        })),
        campaignsHit: request.campaigns.map((c) => ({ id: c.id, tiers: 1, reward: 10_000 })),
        nearMisses: [],
        unallocated: [],
        totalExpected: 10_000 * request.campaigns.length,
        baseline: { strategy: "single_best_card", card: null, total: 0 },
        solver: { engine: "cp-sat", ms: 1 },
      },
    }),
}));

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("bildirim işi (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const SECRET = "bildirim-test-sırrı";
  const MONDAY = "2026-11-23";
  const ids = { bank: "", user: "", market: "", started: "", ending: "", later: "" };
  const mails: Mail[] = [];
  const send = (mail: Mail) => {
    mails.push(mail);
    return Promise.resolve();
  };
  const mine = () => mails.filter((mail) => mail.to === `bildirim-${run}@kartplan.test`);

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `Bildirim Bankası ${run}` } });
    const program = await prisma.program.create({
      data: { bankId: bank.id, slug: `bildirim-${run}`, name: "P", pointName: "P" },
    });
    const market = await prisma.category.create({
      data: { slug: `bildirim-m-${run}`, name: "Bildirim market" },
    });
    const product = await prisma.cardProduct.create({
      data: { programId: program.id, name: "Bildirim Kart", type: "CREDIT" },
    });
    const user = await prisma.user.create({
      data: { email: `bildirim-${run}@kartplan.test`, emailVerified: new Date() },
    });
    await prisma.userCard.create({ data: { userId: user.id, cardProductId: product.id } });
    await prisma.spendProfile.create({
      data: { userId: user.id, categoryId: market.id, monthlyKurus: 500_000 },
    });
    const campaign = (title: string, startsAt: string, endsAt: string) =>
      prisma.campaign.create({
        data: {
          programId: program.id,
          title,
          sourceUrl: `https://ornek-banka.test/${run}/${title}`,
          rawText: "SENTETİK",
          rawHash: "x",
          startsAt: new Date(`${startsAt}T00:00:00Z`),
          endsAt: new Date(`${endsAt}T00:00:00Z`),
          joinMethod: "SMS",
          status: "APPROVED",
          rules: {
            create: [
              {
                categoryIds: [market.id],
                thresholdType: "CUMULATIVE",
                thresholdKurus: 100_000,
                rewardType: "POINTS",
                rewardKurus: 10_000,
              },
            ],
          },
        },
      });
    const [started, ending, later] = await Promise.all([
      campaign("basladi", "2026-11-20", "2026-11-30"),
      campaign("bitiyor", "2026-11-01", "2026-11-25"),
      campaign("sonra", "2026-12-01", "2026-12-31"),
    ]);
    await prisma.userCampaignStatus.create({
      data: { userId: user.id, campaignId: ending.id, joined: true },
    });
    Object.assign(ids, {
      bank: bank.id,
      user: user.id,
      market: market.id,
      started: started.id,
      ending: ending.id,
      later: later.id,
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.cardProduct.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.category.deleteMany({ where: { id: ids.market } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    mails.length = 0;
    await prisma.notificationLog.deleteMany({ where: { userId: ids.user } });
    await prisma.user.update({ where: { id: ids.user }, data: { notifyPrefs: {} } });
  });

  const runAt = (today: string, forceWeekly = false) =>
    runNotifications({
      base: "https://kartplan.test",
      secret: SECRET,
      today,
      send,
      forceWeekly,
      userIds: [ids.user],
    });

  it("hatırlatma, son günler ve haftalık özet bir kez gider", async () => {
    await runAt(MONDAY);
    expect(mine().map((mail) => mail.subject)).toEqual([
      `"basladi" başladı: katılmayı unutma`,
      `"bitiyor": 3 gün kaldı (25 Kasım)`,
      "Bu haftanın planı: ₺200 beklenen kazanç",
    ]);
    const [reminder] = mine();
    expect(reminder?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = reminder?.headers?.["List-Unsubscribe"]?.slice(1, -1) ?? "";
    expect(link).toMatch(/^https:\/\/kartplan\.test\/api\/unsubscribe\?/);
    const params = new URL(link).searchParams;
    expect(
      verifyUnsubscribe({ u: params.get("u"), k: params.get("k"), t: params.get("t") }, SECRET),
    ).toEqual({ userId: ids.user, target: "joinReminder" });

    mails.length = 0;
    await runAt(MONDAY);
    await runAt("2026-11-24", true); // aynı ISO hafta
    expect(mine()).toEqual([]);
    expect(await prisma.notificationLog.count({ where: { userId: ids.user } })).toBe(3);
  });

  it("kapatılan bildirim gitmez; hepsi kapalıysa kullanıcı atlanır", async () => {
    await unsubscribe(ids.user, "joinReminder");
    await runAt("2026-11-21"); // Cumartesi: haftalık yok, bitiş 4 gün sonra
    expect(mine()).toEqual([]);
    await unsubscribe(ids.user, "all");
    const stats = await runAt(MONDAY);
    expect(mine()).toEqual([]);
    expect(stats.sent).toEqual({
      JOIN_REMINDER: 0,
      ENDING_SOON: 0,
      WEEKLY_SUMMARY: 0,
      MONTHLY_REPORT: 0,
    });
  });

  it("ay sonu raporu: ayın 1'inde, geçen ay harcama girildiyse, bir kez", async () => {
    const reports = () => mine().filter((mail) => mail.subject.includes("raporun"));
    await runAt("2026-12-01");
    expect(reports()).toEqual([]); // kasımda harcama yok

    const card = await prisma.userCard.findFirstOrThrow({ where: { userId: ids.user } });
    const spend = (day: string, amountKurus: number) =>
      prisma.transaction.create({
        data: {
          userId: ids.user,
          userCardId: card.id,
          categoryId: ids.market,
          amountKurus,
          date: new Date(`${day}T00:00:00Z`),
        },
      });
    await spend("2026-11-10", 150_000);
    await spend("2026-11-22", 50_000);
    await prisma.notificationLog.deleteMany({ where: { userId: ids.user } });

    await runAt("2026-12-01");
    const [mail] = reports();
    expect(reports()).toHaveLength(1);
    expect(mail?.subject).toBe("Kasım 2026 raporun: ~₺100 kazandın");
    expect(mail?.text).toContain("bitiyor ~₺100");
    expect(mail?.text).toContain("basladi ~₺100 · eşiğe ulaşılmadı");
    expect(mail?.text).toContain("https://kartplan.test/plan/rapor?ay=2026-11");

    mails.length = 0;
    await runAt("2026-12-01");
    expect(reports()).toEqual([]);
    await prisma.transaction.deleteMany({ where: { userId: ids.user } });
  });

  it("push: e-postayla birlikte cihazlara da gider; biten abonelik silinir", async () => {
    const pushes: { endpoint: string; payload: unknown }[] = [];
    await prisma.pushSubscription.createMany({
      data: ["canli", "bitti"].map((name) => ({
        userId: ids.user,
        endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${run}`,
        p256dh: "p".repeat(87),
        auth: "a".repeat(22),
      })),
    });
    const stats = await runNotifications({
      base: "https://kartplan.test",
      secret: SECRET,
      today: MONDAY,
      send,
      push: (target, payload) => {
        pushes.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        if (target.endpoint.includes("bitti")) {
          return Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }));
        }
        return Promise.resolve({ statusCode: 201 });
      },
      userIds: [ids.user],
    });
    expect(mine()).toHaveLength(3);
    expect(stats.pushed).toBe(3);
    // İlk bildirimde biten abonelik silinir; sonrakiler yalnızca canlı cihaza.
    const count = (name: string) => pushes.filter((p) => p.endpoint.includes(name)).length;
    expect([count("canli"), count("bitti")]).toEqual([3, 1]);
    expect(pushes.find((p) => p.endpoint.includes("canli"))?.payload).toEqual({
      title: "Katılmayı unutma",
      body: `"basladi" başladı: katılmayı unutma`,
      url: `/kampanyalarim/${ids.started}`,
      tag: "join",
    });
    const left = await prisma.pushSubscription.findMany({ where: { userId: ids.user } });
    expect(left.map((d) => d.endpoint)).toEqual([
      `https://fcm.googleapis.com/fcm/send/canli-${run}`,
    ]);
    expect(left[0]?.lastSentAt).not.toBeNull();
    await prisma.pushSubscription.deleteMany({ where: { userId: ids.user } });
  });

  it("gönderim hatası kaydedilmez, ertesi çalıştırmada yeniden denenir", async () => {
    const failing = () => Promise.reject(new Error("SMTP yok"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stats = await runNotifications({
      base: "https://kartplan.test",
      secret: SECRET,
      today: "2026-11-21",
      send: failing,
      userIds: [ids.user],
    });
    expect(stats.failed).toBeGreaterThan(0);
    expect(await prisma.notificationLog.count({ where: { userId: ids.user } })).toBe(0);
    await runAt("2026-11-21");
    expect(mine().map((mail) => mail.subject)).toEqual([`"basladi" başladı: katılmayı unutma`]);
    vi.restoreAllMocks();
  });
});
