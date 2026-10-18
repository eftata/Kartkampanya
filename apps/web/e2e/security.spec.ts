import { expect, test } from "@playwright/test";

import { randomIp, signUp, uniqueEmail } from "./helpers";
import { countMails } from "./mailpit";

test("güvenlik başlıkları her yanıtta; sayfalar CSP ihlali olmadan çalışır", async ({
  page,
  request,
}) => {
  for (const path of ["/", "/kampanyalar", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }

  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  // Giriş, onay, onboarding ve istemci etkileşimli sayfalar (Server Action, istemci gezinmesi).
  await signUp(page);
  await page.goto("/kartlarim");
  await page.getByRole("link", { name: "Kampanyalar", exact: true }).first().click();
  await expect(page).toHaveURL(/\/kampanyalarim/);
  await page.goto("/profil");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(violations).toEqual([]);
});

test("istek sınırı: aynı istemciden dakikada 120'den fazla API isteği 429 alır", async ({
  request,
}) => {
  const headers = { "x-forwarded-for": randomIp() };
  const statuses: number[] = [];
  for (let i = 0; i < 121; i++) {
    statuses.push((await request.get("/api/me/plan", { headers })).status());
  }
  expect(statuses.slice(0, 120).every((status) => status === 401)).toBe(true);
  const limited = await request.get("/api/me/plan", { headers });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  expect(await limited.json()).toEqual({ error: expect.stringContaining("Çok fazla istek") });

  // Başka istemci etkilenmez; sayfa görüntüleme ve sağlık kontrolü sınırlanmaz.
  const other = { "x-forwarded-for": randomIp() };
  expect((await request.get("/api/me/plan", { headers: other })).status()).toBe(401);
  expect((await request.get("/api/health", { headers })).status()).toBe(200);
  expect((await request.get("/kampanyalar", { headers })).status()).toBe(200);
});

test("giriş bağlantısı: aynı e-postaya saatte en fazla 5", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  const email = uniqueEmail("sinir");
  for (let i = 0; i < 5; i++) {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill(email);
    await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
    await expect(page).toHaveURL("/giris/dogrula");
  }
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page.getByText("Çok fazla giriş bağlantısı istendi")).toBeVisible();
  // Girilen adres korunur; e-posta gönderilmedi.
  await expect(page.getByLabel("E-posta")).toHaveValue(email);
  expect(await countMails(email, "KartPlan giriş bağlantın")).toBe(5);
});
