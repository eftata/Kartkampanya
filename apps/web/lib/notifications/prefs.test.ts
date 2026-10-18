import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getNotificationPrefs, saveNotificationPrefs, unsubscribe } from "./prefs";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("bildirim tercihleri (veritabanı)", () => {
  let prisma: PrismaClient;
  let userId = "";

  beforeAll(async () => {
    prisma = createPrismaClient();
    const user = await prisma.user.create({
      data: { email: `tercih-${crypto.randomUUID().slice(0, 8)}@kartplan.test` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("varsayılan açık; kaydedilen okunur; tek tür kapatma diğerlerini korur", async () => {
    expect(await getNotificationPrefs(userId)).toEqual({
      joinReminder: true,
      endingSoon: true,
      weeklySummary: true,
      monthlyReport: true,
    });
    await saveNotificationPrefs(userId, {
      joinReminder: true,
      endingSoon: false,
      weeklySummary: true,
      monthlyReport: true,
    });
    await unsubscribe(userId, "weeklySummary");
    expect(await getNotificationPrefs(userId)).toEqual({
      joinReminder: true,
      endingSoon: false,
      weeklySummary: false,
      monthlyReport: true,
    });
    await unsubscribe(userId, "all");
    expect(Object.values(await getNotificationPrefs(userId))).toEqual([false, false, false, false]);
  });

  it("olmayan kullanıcı için abonelik iptali false döner", async () => {
    expect(await unsubscribe("yok", "all")).toBe(false);
  });
});
