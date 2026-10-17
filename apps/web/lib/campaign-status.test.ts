import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setCampaignStatus } from "./campaign-status";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("kampanya işaretleri (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids = { bank: "", approved: "", draft: "", user: "", other: "" };

  beforeAll(async () => {
    prisma = createPrismaClient();
    const bank = await prisma.bank.create({ data: { name: `İşaret Bankası ${run}` } });
    const program = await prisma.program.create({
      data: { bankId: bank.id, slug: `isaret-${run}`, name: "P", pointName: "P" },
    });
    const campaign = (key: string, status: "APPROVED" | "DRAFT") =>
      prisma.campaign.create({
        data: {
          programId: program.id,
          title: key,
          sourceUrl: `https://ornek-banka.test/${run}/${key}`,
          rawText: "SENTETİK",
          rawHash: "x",
          startsAt: new Date("2026-11-01T00:00:00Z"),
          endsAt: new Date("2026-11-30T00:00:00Z"),
          joinMethod: "SMS",
          status,
        },
      });
    const [approved, draft, user, other] = await Promise.all([
      campaign("onayli", "APPROVED"),
      campaign("taslak", "DRAFT"),
      prisma.user.create({ data: { email: `isaret-${run}@kartplan.test` } }),
      prisma.user.create({ data: { email: `isaret2-${run}@kartplan.test` } }),
    ]);
    Object.assign(ids, {
      bank: bank.id,
      approved: approved.id,
      draft: draft.id,
      user: user.id,
      other: other.id,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ids.user, ids.other] } } });
    await prisma.campaign.deleteMany({ where: { program: { bankId: ids.bank } } });
    await prisma.program.deleteMany({ where: { bankId: ids.bank } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.$disconnect();
  });

  const row = (userId = ids.user) =>
    prisma.userCampaignStatus.findUnique({
      where: { userId_campaignId: { userId, campaignId: ids.approved } },
    });

  it("katıldım işareti satırı oluşturur, tarihi korur ve geri alınır", async () => {
    expect(await setCampaignStatus(ids.user, ids.approved, { joined: true })).toEqual({
      ok: true,
      data: { joined: true, inPlan: false },
    });
    const first = await row();
    expect(first?.joinedAt).toBeInstanceOf(Date);

    await setCampaignStatus(ids.user, ids.approved, { joined: true });
    expect((await row())?.joinedAt).toEqual(first?.joinedAt);

    await setCampaignStatus(ids.user, ids.approved, { inPlan: true });
    expect(await row()).toMatchObject({ joined: true, inPlan: true });

    expect(await setCampaignStatus(ids.user, ids.approved, { joined: false })).toEqual({
      ok: true,
      data: { joined: false, inPlan: true },
    });
    expect((await row())?.joinedAt).toBeNull();
  });

  it("işaretler kullanıcıya özeldir", async () => {
    expect(await row(ids.other)).toBeNull();
  });

  it("taslak ya da olmayan kampanya işaretlenemez", async () => {
    for (const id of [ids.draft, "yok"]) {
      expect(await setCampaignStatus(ids.user, id, { joined: true })).toEqual({
        ok: false,
        code: "not_found",
        error: "Kampanya bulunamadı.",
      });
    }
  });
});
