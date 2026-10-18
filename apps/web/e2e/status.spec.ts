import { expect, test } from "@playwright/test";

import { E2E_CRON_SECRET } from "./env";
import { makeAdmin, signUp, uniqueEmail } from "./helpers";

test("/api/status bileşenleri yoklar, ayrıntı sızdırmaz", async ({ request }) => {
  const response = await request.get("/api/status");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    status: string;
    checks: Record<string, { state: string; ms: number }>;
  };
  expect(body.status).toMatch(/^(ok|degraded)$/);
  expect(Object.keys(body.checks).sort()).toEqual(["database", "engine", "redis"]);
  expect(body.checks.database?.state).toBe("ok");
  expect(body.checks.engine?.state).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/localhost|postgres|redis:\/\//);
});

test("admin sistem durumu panosu: bileşenler, zamanlanmış işler ve sayılar", async ({
  page,
  request,
}) => {
  // Bir iş çalıştır: panoda son çalışma görünsün.
  const purge = await request.get("/api/cron/purge-accounts", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(purge.status()).toBe(200);

  const email = uniqueEmail("durum");
  await signUp(page, email);
  // Admin değilken yok.
  await page.goto("/admin/durum");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();

  await makeAdmin(email);
  await page.goto("/admin/durum");
  await expect(page.getByRole("heading", { name: "Sistem durumu" })).toBeVisible();
  const components = page.getByRole("region", { name: "Bileşenler" });
  await expect(components.getByRole("listitem").filter({ hasText: "Veritabanı" })).toContainText(
    "Çalışıyor",
  );
  await expect(components.getByRole("listitem").filter({ hasText: "Motor" })).toContainText(
    "Çalışıyor",
  );
  const jobs = page.getByRole("region", { name: "Zamanlanmış işler" });
  await expect(
    jobs.getByRole("row").filter({ hasText: "Silinen hesaplar ve eski kullanım günleri" }),
  ).toContainText("Zamanında");
  await expect(page.getByRole("group", { name: "Onay bekleyen" })).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Sistem durumu" }).first(),
  ).toBeVisible();
});
