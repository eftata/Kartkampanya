import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

describe("createPrismaClient", () => {
  it("DATABASE_URL yoksa anlaşılır bir hata verir", () => {
    expect(() => createPrismaClient("")).toThrow(/DATABASE_URL/);
  });
});

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("User ve Consent (veritabanı)", () => {
  let prisma: PrismaClient;
  const email = `test-${crypto.randomUUID()}@kartplan.test`;

  beforeAll(() => {
    prisma = createPrismaClient();
  });

  afterAll(async () => {
    await prisma.consent.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("varsayılanlarla kullanıcı oluşturur ve rıza geçmişini saklar", async () => {
    const user = await prisma.user.create({ data: { email } });
    expect(user.role).toBe("USER");
    expect(user.deletedAt).toBeNull();
    expect(user.notifyPrefs).toEqual({});

    await prisma.consent.create({
      data: { userId: user.id, kind: "pazarlama", version: "2026-10", granted: true },
    });
    await prisma.consent.create({
      data: { userId: user.id, kind: "pazarlama", version: "2026-10", granted: false },
    });

    const latest = await prisma.consent.findFirst({
      where: { userId: user.id, kind: "pazarlama" },
      orderBy: { createdAt: "desc" },
    });
    expect(latest?.granted).toBe(false);
    expect(await prisma.consent.count({ where: { userId: user.id } })).toBe(2);
  });

  it("aynı e-postayla ikinci kullanıcıya izin vermez", async () => {
    await expect(prisma.user.create({ data: { email } })).rejects.toThrow();
  });
});
