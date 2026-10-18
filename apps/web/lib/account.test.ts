import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportUserData, purgeDeletedAccounts, requestAccountDeletion } from "./account";
import {
  getConsentStatus,
  hasCurrentConsent,
  recordConsents,
  setMarketingConsent,
} from "./consent";
import { LEGAL_VERSIONS } from "./legal";

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("KVKK: rıza, veri kopyası, silme (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const email = `kvkk-${run}@kartplan.test`;
  let userId = "";

  beforeAll(async () => {
    prisma = createPrismaClient();
    const market = await prisma.category.findFirst({ where: { parentId: null } });
    const product = await prisma.cardProduct.findFirst();
    const user = await prisma.user.create({
      data: {
        email,
        sessions: { create: { sessionToken: `gizli-${run}`, expires: new Date(Date.now() + 1e9) } },
        ...(product
          ? { cards: { create: { cardProductId: product.id, nickname: "Maaş kartım" } } }
          : {}),
        ...(market ? { spend: { create: { categoryId: market.id, monthlyKurus: 123_400 } } } : {}),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rıza: zorunlular olmadan hizmet yok; pazarlama ayrı ve geçmişli", async () => {
    expect(await hasCurrentConsent(userId)).toBe(false);
    await recordConsents(userId, false);
    expect(await hasCurrentConsent(userId)).toBe(true);
    await setMarketingConsent(userId, true);
    const status = await getConsentStatus(userId);
    expect(status.aydinlatma).toMatchObject({ granted: true, version: LEGAL_VERSIONS.aydinlatma });
    expect(status.pazarlama?.granted).toBe(true);
    expect(await prisma.consent.count({ where: { userId, kind: "pazarlama" } })).toBe(2);
  });

  it("veri kopyası kullanıcının kayıtlarını okunur adlarla içerir, sırları içermez", async () => {
    await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: `https://fcm.googleapis.com/fcm/send/gizli-uc-${run}`,
        p256dh: "p".repeat(87),
        auth: `gizli-anahtar-${run}`,
      },
    });
    const data = await exportUserData(userId);
    expect(data.account.email).toBe(email);
    expect(data.pushDevices).toEqual([
      expect.objectContaining({ service: "fcm.googleapis.com", lastSentAt: null }),
    ]);
    expect(data.consents.map((c) => c.kind)).toContain("kvkk_aydinlatma");
    expect(data.account.activeSessions).toBe(1);
    const text = JSON.stringify(data);
    expect(text).not.toContain(`gizli-${run}`); // oturum anahtarı
    expect(text).not.toContain(`gizli-uc-${run}`); // push adresi
    expect(text).not.toContain(`gizli-anahtar-${run}`);
    if (data.cards.length) expect(data.cards[0]).toMatchObject({ nickname: "Maaş kartım" });
    if (data.spendProfile.length) expect(data.spendProfile[0]?.monthlyKurus).toBe(123_400);
  });

  it("silme: hemen kapanır ve oturumlar biter; 30 gün sonra kalıcı silinir", async () => {
    const now = new Date("2026-11-01T10:00:00Z");
    await requestAccountDeletion(userId, now);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletedAt).toEqual(now);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);

    await purgeDeletedAccounts(new Date("2026-11-30T10:00:00Z"), [userId]); // 29 gün
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
    expect(await purgeDeletedAccounts(new Date("2026-12-01T10:00:00Z"), [userId])).toBe(1);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.consent.count({ where: { userId } })).toBe(0);
  });
});
