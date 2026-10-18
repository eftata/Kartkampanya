import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportUserData } from "./account";
import { markFirstCard, markPlanViewed, noteActivity, pruneActivity } from "./activity";
import { computeFunnel } from "./funnel";
import { getFunnelUsers } from "./funnel-data";
import { CONSENT_KINDS, LEGAL_VERSIONS } from "./legal";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("kullanım günleri ve huni (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const ids: string[] = [];

  async function makeUser(label: string, signedUpAt: Date | null, role: "USER" | "ADMIN" = "USER") {
    const user = await prisma.user.create({
      data: { email: `huni-${label}-${run}@kartplan.test`, role },
    });
    ids.push(user.id);
    if (signedUpAt) {
      await prisma.consent.create({
        data: {
          userId: user.id,
          kind: CONSENT_KINDS.acikRiza,
          version: LEGAL_VERSIONS.acikRiza,
          granted: true,
          createdAt: signedUpAt,
        },
      });
    }
    return user.id;
  }

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("gün başına tek kayıt; kilometre taşları yalnızca ilk kez yazılır", async () => {
    const userId = await makeUser("not", new Date());
    const now = new Date("2026-11-03T21:30:00Z"); // Türkiye'de 4 Kasım
    noteActivity(userId, now);
    noteActivity(userId, now);
    noteActivity(userId, new Date("2026-11-05T09:00:00Z"));
    await expect
      .poll(async () =>
        (await prisma.userActivityDay.findMany({ where: { userId }, orderBy: { day: "asc" } })).map(
          (row) => row.day,
        ),
      )
      .toEqual(["2026-11-04", "2026-11-05"]);

    const first = new Date("2026-11-04T10:00:00Z");
    markFirstCard(userId, first);
    markPlanViewed(userId, first);
    await expect
      .poll(
        async () =>
          (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).firstPlanViewAt,
      )
      .toEqual(first);
    markFirstCard(userId, new Date("2026-11-05T10:00:00Z"));
    markPlanViewed(userId, new Date("2026-11-05T10:00:00Z"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.firstCardAt).toEqual(first);
    expect(user.firstPlanViewAt).toEqual(first);

    const data = await exportUserData(userId);
    expect(data.activeDays).toEqual(["2026-11-04", "2026-11-05"]);
    expect(data.account.firstPlanViewedAt).toEqual(first);
  });

  it("saklama süresi dolan günler silinir", async () => {
    const userId = await makeUser("eski", new Date());
    await prisma.userActivityDay.createMany({
      data: [
        { userId, day: "2020-01-01" },
        { userId, day: "2026-11-01" },
      ],
    });
    expect(await pruneActivity(new Date("2026-11-30T12:00:00Z"))).toBeGreaterThanOrEqual(1);
    const days = await prisma.userActivityDay.findMany({ where: { userId } });
    expect(days.map((row) => row.day)).toEqual(["2026-11-01"]);
  });

  it("huni: onaylı kullanıcılar, adminler ve onaysızlar hariç", async () => {
    const signup = new Date("2026-11-02T07:00:00Z");
    const returned = await makeUser("donen", signup);
    await prisma.user.update({
      where: { id: returned },
      data: { firstCardAt: signup, firstPlanViewAt: signup },
    });
    await prisma.userActivityDay.createMany({
      data: [
        { userId: returned, day: "2026-11-02" },
        { userId: returned, day: "2026-11-10" },
      ],
    });
    await makeUser("donmeyen", signup);
    await makeUser("onaysiz", null);
    await makeUser("admin", signup, "ADMIN");

    const users = (await getFunnelUsers()).filter(
      (user) => user.signedUpAt.getTime() === signup.getTime(),
    );
    expect(users).toHaveLength(2);
    const funnel = computeFunnel(users, new Date("2026-11-30T12:00:00Z"));
    expect(funnel.steps.map((step) => step.count)).toEqual([2, 1, 1]);
    expect(funnel.week2).toEqual({ eligible: 2, returned: 1 });
  });
});
