import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordJob } from "./jobs";
import { getSystemOverview } from "./system-status";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("iş kayıtları ve sistem durumu (veritabanı)", () => {
  let prisma: PrismaClient;
  const started = new Date();

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    // Yalnızca bu testin kayıtları (izleme panosunu kirletmesin).
    await prisma.jobRun.deleteMany({
      where: {
        startedAt: { gte: started },
        OR: [{ summary: { path: ["test"], equals: true } }, { error: { contains: "test hatası" } }],
      },
    });
    await prisma.$disconnect();
  });

  it("başarılı iş özetiyle, başarısız iş temizlenmiş hata mesajıyla kaydedilir", async () => {
    const result = await recordJob("purge-accounts", async () => ({ purged: 0, test: true }));
    expect(result).toEqual({ purged: 0, test: true });
    const ok = await prisma.jobRun.findFirstOrThrow({
      where: { name: "purge-accounts" },
      orderBy: { startedAt: "desc" },
    });
    expect(ok).toMatchObject({ status: "SUCCEEDED", summary: { purged: 0, test: true } });
    expect(ok.finishedAt).not.toBeNull();

    await expect(
      recordJob("purge-accounts", () => Promise.reject(new Error("test hatası: ali@ornek.com"))),
    ).rejects.toThrow("test hatası");
    const failed = await prisma.jobRun.findFirstOrThrow({
      where: { name: "purge-accounts" },
      orderBy: { startedAt: "desc" },
    });
    expect(failed).toMatchObject({ status: "FAILED", error: "test hatası: [e-posta]" });
  });

  it("pano: bileşenler, işler, kuyruk ve sayılar", async () => {
    const overview = await getSystemOverview();
    expect(overview.components.database.state).toBe("ok");
    expect(["ok", "down", "disabled"]).toContain(overview.components.engine.state);
    const purge = overview.jobs.find((job) => job.name === "purge-accounts");
    // Az önceki başarısız kayıt en son çalışma.
    expect(purge?.health).toBe("failed");
    expect(overview.jobs.map((job) => job.name)).toEqual(["notifications", "purge-accounts"]);
    expect(overview.queue.drafts).toBeGreaterThanOrEqual(0);
    expect(overview.users.active).toBeGreaterThanOrEqual(0);
    expect(typeof overview.last24h.plans).toBe("number");
  });
});
