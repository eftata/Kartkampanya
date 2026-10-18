import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { FeedbackInput } from "@kartplan/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportUserData } from "./account";
import { createFeedback, getFeedbackList, getMyFeedback, setFeedbackStatus } from "./feedback";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("geri bildirim (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const email = `geribildirim-${run}@kartplan.test`;
  let userId = "";
  let adminId = "";

  beforeAll(async () => {
    prisma = createPrismaClient();
    userId = (await prisma.user.create({ data: { email } })).id;
    adminId = (
      await prisma.user.create({ data: { email: `gb-admin-${run}@kartplan.test`, role: "ADMIN" } })
    ).id;
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    await prisma.$disconnect();
  });

  it("gönderir, kullanıcı kendi listesini görür, admin e-postayla listeler", async () => {
    const first = await createFeedback(
      userId,
      FeedbackInput.parse({ kind: "BUG", message: `Plan açılmıyor ${run}`, page: "/plan?x=1" }),
    );
    expect(first).toMatchObject({ ok: true, data: { kind: "BUG", page: "/plan", status: "NEW" } });
    await createFeedback(
      userId,
      FeedbackInput.parse({ kind: "IDEA", message: `Fikir ${run}`, rating: 5 }),
    );

    const mine = await getMyFeedback(userId);
    expect(mine.map((item) => item.message)).toEqual([`Fikir ${run}`, `Plan açılmıyor ${run}`]);

    const { items, counts } = await getFeedbackList("NEW");
    const ours = items.filter((item) => item.message.endsWith(run));
    expect(ours).toHaveLength(2);
    expect(ours[0]).toMatchObject({ email, rating: 5 });
    expect(counts.NEW).toBeGreaterThanOrEqual(2);
  });

  it("admin durumu değiştirir, işlem kaydı yazılır; bilinmeyen kayıt 404", async () => {
    const [item] = await getMyFeedback(userId);
    const actor = { id: adminId, email: `gb-admin-${run}@kartplan.test` };
    expect(await setFeedbackStatus(actor, item!.id, "READ")).toEqual({
      ok: true,
      data: { status: "READ" },
    });
    // Aynı duruma tekrar: değişiklik ve kayıt yok.
    await setFeedbackStatus(actor, item!.id, "READ");
    const logs = await prisma.adminAuditLog.findMany({
      where: { actorId: adminId, entityType: "Feedback" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "feedback.status",
      entityId: item!.id,
      data: { status: { from: "NEW", to: "READ" } },
    });
    expect(await setFeedbackStatus(actor, "yok", "DONE")).toMatchObject({ code: "not_found" });
  });

  it("veri kopyasında yer alır, hesap silinince silinir", async () => {
    const data = await exportUserData(userId);
    expect(data.feedback.map((item) => item.message)).toContain(`Fikir ${run}`);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.feedback.count({ where: { message: { endsWith: run } } })).toBe(0);
  });
});
