import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { signUp, uniqueEmail, userIdByEmail } from "./helpers";
import { E2E_CRON_SECRET, E2E_PUSH_URL } from "./env";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };
type Push = {
  id: string;
  headers: Record<string, string | undefined>;
  body: string;
};

/** Tarayıcı yerine abone: P-256 anahtar çifti ve 16 baytlık sır. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
  };
}

/** RFC 8291 (aes128gcm) şifresini çözer: push servisinin göremediği içerik. */
function decrypt(body: string, subscriber: ReturnType<typeof browserKeys>): unknown {
  const data = Buffer.from(body, "base64");
  const salt = data.subarray(0, 16);
  const idLength = data.readUInt8(20);
  const serverKey = data.subarray(21, 21 + idLength);
  const ciphertext = data.subarray(21 + idLength);
  const secret = subscriber.ecdh.computeSecret(serverKey);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    subscriber.ecdh.getPublicKey(),
    serverKey,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", secret, subscriber.auth, info, 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: aes128gcm\0", 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: nonce\0", 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  // Son kayıt: içerik + 0x02 + dolgu (sıfırlar).
  const end = plain.lastIndexOf(2);
  return JSON.parse(plain.subarray(0, end).toString("utf8"));
}

async function pushesFor(id: string): Promise<Push[]> {
  const response = await fetch(`${E2E_PUSH_URL}/pushes`);
  return ((await response.json()) as Push[]).filter((push) => push.id === id);
}

test("PWA: manifest, simgeler, servis çalışanı ve bağlantı yokken sayfa", async ({
  page,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as {
    short_name: string;
    start_url: string;
    display: string;
    icons: { src: string; purpose: string }[];
  };
  expect(body).toMatchObject({ short_name: "KartPlan", start_url: "/plan", display: "standalone" });
  expect(body.icons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  for (const icon of [...body.icons.map((i) => i.src), "/icons/apple-touch-icon.png"]) {
    const response = await request.get(icon);
    expect(response.headers()["content-type"], icon).toBe("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL;
  });
  expect(scriptUrl).toMatch(/\/sw\.js$/);

  // Çevrimdışı sayfası kurulumda önbelleğe alınır (ağ yokken gezinme ona düşer). Playwright'ta
  // servis çalışanının isteklerini kesmek güvenilir değil; önbellek içeriği denetlenir.
  const offline = await page.evaluate(async () => {
    const cached = await caches.match("/offline.html");
    return cached ? await cached.text() : null;
  });
  expect(offline).toContain("İnternet bağlantısı yok");
});

test("web push: cihaz kaydı, deneme ve haftalık özet bildirimi şifreli gider", async ({
  page,
  request,
}) => {
  const run = Date.now().toString(36);
  const email = uniqueEmail("push");
  await signUp(page, email);
  const api = page.request;

  // Kart ve harcama profili (haftalık özet için plan gerekir).
  const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
  const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
  await api.post("/api/me/cards", { data: { cardProductId: bonus.cards[0]!.id } });
  const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
  await api.put("/api/me/spend-profile", {
    data: {
      items: [
        { categoryId: categories.find((c) => c.slug === "market")!.id, monthlyKurus: 400_000 },
      ],
    },
  });

  // Profilim: bu cihazda açma düğmesi (gerçek tarayıcı aboneliği push servisine bağlanır;
  // burada abonelik API ile sahte servise yapılır).
  // Başsız Chromium bildirim göstermez (izin "engelli"); bölüm durumu denetleyip açıklar.
  await page.goto("/profil");
  const pushRegion = page.getByRole("region", { name: "Anlık bildirimler" });
  await expect(
    pushRegion.getByRole("heading", { name: "Bu cihazda anlık bildirim" }),
  ).toBeVisible();
  await expect(pushRegion).not.toContainText("Denetleniyor");

  const status = (await (await api.get("/api/me/push")).json()) as {
    enabled: boolean;
    publicKey: string;
    devices: number;
  };
  expect(status).toMatchObject({ enabled: true, devices: 0 });

  const device = browserKeys();
  const endpoint = `${E2E_PUSH_URL}/push/${run}`;
  // İzin listesi dışındaki adres (SSRF) reddedilir.
  const blocked = await api.post("/api/me/push", {
    data: { endpoint: "https://169.254.169.254/latest", keys: device.keys },
  });
  expect(blocked.status()).toBe(409);
  const saved = await api.post("/api/me/push", { data: { endpoint, keys: device.keys } });
  expect(saved.status()).toBe(201);
  // Aboneliği bitmiş ikinci cihaz: ilk gönderimde silinir.
  await api.post("/api/me/push", {
    data: { endpoint: `${E2E_PUSH_URL}/push/gone-${run}`, keys: browserKeys().keys },
  });
  expect(((await (await api.get("/api/me/push")).json()) as { devices: number }).devices).toBe(2);

  const tested = await api.post("/api/me/push/test");
  expect(tested.status()).toBe(200);
  expect(await tested.json()).toEqual({ sent: 1, removed: 1, failed: 0 });
  const [first] = await pushesFor(run);
  expect(first?.headers).toMatchObject({ ttl: "86400", urgency: "normal", encoding: "aes128gcm" });
  expect(first?.headers.authorization).toContain(`k=${status.publicKey}`);
  expect(decrypt(first!.body, device)).toEqual({
    title: "KartPlan bildirimleri açık",
    body: "Kampanya hatırlatmaları bu cihaza da gelecek.",
    url: "/profil",
    tag: "test",
  });
  expect(((await (await api.get("/api/me/push")).json()) as { devices: number }).devices).toBe(1);

  // Günlük iş: e-postayla birlikte push.
  const userId = await userIdByEmail(email);
  const cron = await request.get(`/api/cron/notifications?user=${userId}&weekly=1`, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  // Paralel testlerin kampanyaları katılım hatırlatması da doğurabilir: her e-postaya bir push.
  const stats = (await cron.json()) as { pushed: number; sent: Record<string, number> };
  expect(stats.sent.WEEKLY_SUMMARY).toBe(1);
  expect(stats.pushed).toBe(Object.values(stats.sent).reduce((a, b) => a + b, 0));
  const payloads = (await pushesFor(run)).slice(1).map((push) => decrypt(push.body, device));
  expect(payloads).toContainEqual({
    title: "Bu haftanın planı",
    body: expect.stringContaining("beklenen kazanç"),
    url: "/plan",
    tag: "weekly",
  });

  // Kapatınca kayıt silinir.
  await api.delete("/api/me/push", { data: { endpoint } });
  expect(((await (await api.get("/api/me/push")).json()) as { devices: number }).devices).toBe(0);
});
