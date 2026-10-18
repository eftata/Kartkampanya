import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { FeedbackInput } from "@kartplan/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFeedback, getOpenCampaignReports, getReportableCampaign } from "./feedback";
import { getDataQuality } from "./system-status";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("veri doğruluğu (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const NOW = new Date();
  const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
  const ids = { bank: "", program: "", source: "", user: "", seen: "", gone: "", draft: "" };

  async function campaign(key: string, status: "APPROVED" | "DRAFT", lastSeenAt: Date) {
    const created = await prisma.campaign.create({
      data: {
        programId: ids.program,
        sourceId: ids.source,
        title: `Doğruluk ${key} ${run}`,
        sourceUrl: `https://ornek-banka.test/dogruluk/${run}/${key}`,
        rawText: "SENTETİK",
        rawHash: "x",
        summary: [],
        startsAt: hoursAgo(24 * 10),
        endsAt: new Date(NOW.getTime() + 20 * 86_400_000),
        joinMethod: "AUTO",
        status,
        lastSeenAt,
      },
    });
    return created.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient();
    ids.bank = (await prisma.bank.create({ data: { name: `Doğruluk Bankası ${run}` } })).id;
    ids.program = (
      await prisma.program.create({
        data: { bankId: ids.bank, slug: `dogruluk-${run}`, name: "Doğruluk", pointName: "P" },
      })
    ).id;
    ids.source = (
      await prisma.campaignSource.create({
        data: { programId: ids.program, adapter: `dogruluk_${run}`, listUrl: "https://x.test" },
      })
    ).id;
    await prisma.pipelineRun.create({
      data: {
        sourceId: ids.source,
        status: "SUCCEEDED",
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(2),
      },
    });
    ids.user = (await prisma.user.create({ data: { email: `dogruluk-${run}@kartplan.test` } })).id;
    ids.seen = await campaign("gorunen", "APPROVED", hoursAgo(3));
    ids.gone = await campaign("kaybolan", "APPROVED", hoursAgo(72));
    ids.draft = await campaign("taslak", "DRAFT", hoursAgo(72));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.campaign.deleteMany({ where: { programId: ids.program } });
    await prisma.pipelineRun.deleteMany({ where: { sourceId: ids.source } });
    await prisma.campaignSource.deleteMany({ where: { id: ids.source } });
    await prisma.program.deleteMany({ where: { id: ids.program } });
    await prisma.bank.deleteMany({ where: { id: ids.bank } });
    await prisma.$disconnect();
  });

  it("kampanyaya bağlı bildirim: yalnızca onaylı/süresi dolmuş kampanyaya", async () => {
    expect(await getReportableCampaign(ids.draft)).toBeNull();
    const rejected = await createFeedback(
      ids.user,
      FeedbackInput.parse({ kind: "DATA", message: "Tarih yanlış", campaignId: ids.draft }),
    );
    expect(rejected).toMatchObject({ ok: false, code: "not_found" });

    const created = await createFeedback(
      ids.user,
      FeedbackInput.parse({ kind: "DATA", message: "Tutar yanlış", campaignId: ids.seen }),
    );
    expect(created).toMatchObject({
      ok: true,
      data: { campaign: { id: ids.seen, title: `Doğruluk gorunen ${run}` } },
    });
    expect((await getOpenCampaignReports(ids.seen)).map((r) => r.message)).toEqual([
      "Tutar yanlış",
    ]);
  });

  it("pano: bildirimli ve kaynakta kaybolan kampanyalar", async () => {
    const quality = await getDataQuality(NOW);
    expect(quality.reported).toContainEqual({
      id: ids.seen,
      title: `Doğruluk gorunen ${run}`,
      count: 1,
    });
    const missing = quality.missing.map((item) => item.id);
    expect(missing).toContain(ids.gone);
    expect(missing).not.toContain(ids.seen);
    expect(missing).not.toContain(ids.draft); // yalnızca yayındakiler
  });
});
