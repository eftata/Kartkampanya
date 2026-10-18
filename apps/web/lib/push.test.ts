import { createECDH, randomBytes } from "node:crypto";

import { createPrismaClient } from "@kartplan/db";
import type { PrismaClient } from "@kartplan/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

import {
  PUSH_MAX_DEVICES,
  deletePushSubscription,
  getPushStatus,
  isAllowedPushEndpoint,
  pushConfig,
  savePushSubscription,
  sendTestPush,
  webPushSender,
} from "./push";

describe("push ayarları ve adres izin listesi", () => {
  it("VAPID anahtarları ve geçerli iletişim adresi yoksa kapalı", () => {
    const keys = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" };
    expect(pushConfig({})).toBeNull();
    expect(pushConfig(keys)).toBeNull();
    expect(pushConfig({ ...keys, VAPID_SUBJECT: "destek@ornek.test" })).toBeNull();
    expect(pushConfig({ ...keys, VAPID_SUBJECT: "mailto:destek@ornek.test" })).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:destek@ornek.test",
    });
  });

  it("yalnızca bilinen push servisleri (SSRF)", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-db5p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(ok, ""), ok).toBe(true);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc", // https değil
      "https://fcm.googleapis.com:8443/x", // port
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.kotu.test/x",
      "https://kotunotify.windows.com/x",
      "https://169.254.169.254/latest/meta-data",
      "http://localhost:3000/api/admin",
      "bozuk",
    ]) {
      expect(isAllowedPushEndpoint(bad, ""), bad).toBe(false);
    }
    // e2e sahte servisi yalnızca açıkça verilirse.
    expect(isAllowedPushEndpoint("http://127.0.0.1:8300/push/a", "http://127.0.0.1:8300")).toBe(
      true,
    );
    expect(isAllowedPushEndpoint("http://127.0.0.1:8301/push/a", "http://127.0.0.1:8300")).toBe(
      false,
    );
  });
});

describe("webPushSender", () => {
  it("VAPID imzalı, şifreli istek; yönlendirme izlenmez; durum kodu döner", async () => {
    const vapid = webpush.generateVAPIDKeys();
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response(null, { status: 410 }));
    };
    const send = webPushSender(
      { ...vapid, subject: "mailto:destek@ornek.test" },
      fakeFetch as typeof fetch,
    );
    const result = await send(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: {
          p256dh: ecdh.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      },
      JSON.stringify({ title: "Gizli başlık" }),
    );
    expect(result).toEqual({ statusCode: 410 });
    const [call] = calls;
    expect(call?.url).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(call?.init).toMatchObject({ method: "POST", redirect: "error" });
    const headers = call?.init.headers as Record<string, string>;
    expect(headers).toMatchObject({
      TTL: "86400",
      Urgency: "normal",
      "Content-Encoding": "aes128gcm",
    });
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));
    // İçerik şifreli: düz metin gövdede yok.
    const body = Buffer.from(call?.init.body as Uint8Array).toString("latin1");
    expect(body).not.toContain("Gizli");
  });
});

// Gerçek veritabanı gerektirir: `docker compose up -d` + `pnpm db:deploy`.
describe.skipIf(!process.env.DATABASE_URL)("push abonelikleri (veritabanı)", () => {
  let prisma: PrismaClient;
  const run = crypto.randomUUID().slice(0, 8);
  const users: string[] = [];
  const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
  const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${run}-${name}`;

  beforeAll(async () => {
    prisma = createPrismaClient();
    for (const name of ["a", "b"]) {
      const user = await prisma.user.create({
        data: { email: `push-${name}-${run}@kartplan.test` },
      });
      users.push(user.id);
    }
  });

  afterEach(() => vi.unstubAllEnvs());

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  const enable = () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:destek@ornek.test");
  };

  it("push kapalıyken kayıt reddedilir; açıkken izinli adres kaydedilir", async () => {
    const [a] = users as [string];
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(await savePushSubscription(a, { endpoint: endpoint("1"), keys })).toMatchObject({
      ok: false,
      error: "Anlık bildirimler şu an kapalı.",
    });
    enable();
    expect(await savePushSubscription(a, { endpoint: "https://kotu.test/x", keys })).toMatchObject({
      ok: false,
      error: "Bu tarayıcının bildirim servisi desteklenmiyor.",
    });
    expect(await savePushSubscription(a, { endpoint: endpoint("1"), keys })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await getPushStatus(a)).toEqual({ enabled: true, publicKey: "BPub", devices: 1 });
  });

  it("aynı tarayıcı başka hesapla abone olunca kayıt taşınır; cihaz sınırı", async () => {
    const [a, b] = users as [string, string];
    enable();
    await savePushSubscription(b, { endpoint: endpoint("1"), keys });
    expect((await getPushStatus(a)).devices).toBe(0);
    expect((await getPushStatus(b)).devices).toBe(1);

    for (let i = 0; i < PUSH_MAX_DEVICES + 2; i++) {
      await savePushSubscription(b, { endpoint: endpoint(`cok-${i}`), keys });
    }
    const left = await prisma.pushSubscription.findMany({ where: { userId: b } });
    expect(left).toHaveLength(PUSH_MAX_DEVICES);
    expect(left.some((d) => d.endpoint === endpoint("1"))).toBe(false); // en eskisi gitti

    await deletePushSubscription(a, endpoint("cok-11")); // başkasının kaydı silinmez
    expect((await getPushStatus(b)).devices).toBe(PUSH_MAX_DEVICES);
    await deletePushSubscription(b, endpoint("cok-11"));
    expect((await getPushStatus(b)).devices).toBe(PUSH_MAX_DEVICES - 1);
  });

  it("deneme bildirimi: cihaz yoksa hata, varsa gönderilir", async () => {
    const [a, b] = users as [string, string];
    const sent: string[] = [];
    const send = (target: { endpoint: string }, payload: string) => {
      sent.push(`${target.endpoint} ${JSON.parse(payload).title}`);
      return Promise.resolve({ statusCode: 201 });
    };
    expect(await sendTestPush(a, send)).toMatchObject({ ok: false, code: "not_found" });
    const result = await sendTestPush(b, send);
    expect(result).toEqual({
      ok: true,
      data: { sent: PUSH_MAX_DEVICES - 1, removed: 0, failed: 0 },
    });
    expect(sent[0]).toContain("KartPlan bildirimleri açık");
  });
});
