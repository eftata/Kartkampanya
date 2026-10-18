import { expect, test } from "@playwright/test";

import { campaignPath } from "../lib/campaign-slug";
import { createDraftCampaign, deleteCampaigns } from "./helpers";

test("landing: nasıl çalışır, güvenceler ve kampanyalara geçiş", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("en çok kazanacağın");
  await expect(page.getByRole("heading", { name: "Nasıl çalışır?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kart bilgisi yok" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^http:\/\/localhost:\d+\/?$/,
  );
  await page.getByRole("link", { name: "Kampanyalara göz at" }).click();
  await expect(page).toHaveURL("/kampanyalar");
  await expect(page.getByRole("heading", { name: "Güncel kart kampanyaları" })).toBeVisible();
});

test("herkese açık kampanyalar: liste, filtre, detay, kanonik adres ve sitemap", async ({
  page,
  request,
}) => {
  const run = Date.now().toString(36);
  const title = `E2E Herkese açık ${run}`;
  // 2099'da başlar: listede "başlamamış" görünür ama paralel testlerin planlarına girmez.
  const ids = [
    await createDraftCampaign(title, {
      status: "APPROVED",
      categorySlug: "market",
    }),
    await createDraftCampaign(`E2E Açık taslak ${run}`, { categorySlug: "market" }),
    await createDraftCampaign(`E2E Açık giyim ${run}`, {
      status: "APPROVED",
      categorySlug: "giyim",
    }),
  ];
  const path = campaignPath({ id: ids[0]!, title });
  try {
    // Giriş yapmadan liste ve filtre.
    await page.goto("/kampanyalar?program=bonus&kategori=market");
    const card = page.getByRole("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(page.getByText(`E2E Açık taslak ${run}`)).toHaveCount(0);
    await expect(page.getByText(`E2E Açık giyim ${run}`)).toHaveCount(0);
    await page.getByLabel("Kategori").selectOption("giyim");
    await expect(page).toHaveURL(/kategori=giyim/);
    await expect(page.getByText(`E2E Açık giyim ${run}`)).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    // Detay: kanonik adres, metadata, koşullar ve plan çağrısı.
    await page.goto("/kampanyalar?kategori=market");
    await page.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page).toHaveTitle(new RegExp(`${title} · Bonus`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path}$`),
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
    await expect(page.getByRole("region", { name: "Koşullar" })).toContainText("2.500");
    await expect(
      page.getByRole("region", { name: "Planına ekle" }).getByRole("link", {
        name: "Planımı oluştur",
      }),
    ).toHaveAttribute("href", "/giris");

    // Eski başlıklı ya da yalnızca id'li bağlantı kanonik adrese yönlenir. Statik kabuk önce
    // gittiği için durum kodu 200; yönlendirme 0 sn'lik meta refresh, 404 ise noindex (ADR 0020).
    await page.goto(`/kampanyalar/eski-baslik-${ids[0]}`);
    await expect(page).toHaveURL(path);
    await page.goto(`/kampanyalar/${ids[0]}`);
    await expect(page).toHaveURL(path);
    const bot = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" };
    const old = await (
      await request.get(`/kampanyalar/eski-baslik-${ids[0]}`, { headers: bot })
    ).text();
    expect(old).toContain(`http-equiv="refresh" content="0;url=${path}"`);
    const draft = await (
      await request.get(`/kampanyalar/taslak-${ids[1]}`, { headers: bot })
    ).text();
    expect(draft).toContain('<meta name="robots" content="noindex"/>');

    // Taslak ve bilinmeyen kampanya 404.
    await page.goto(`/kampanyalar/taslak-${ids[1]}`);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
    await page.goto("/kampanyalar/yok-boyle-bir-kampanya");
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();

    // Sitemap ve robots.
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`${path}</loc>`);
    expect(sitemap).toContain("/kampanyalar</loc>");
    expect(sitemap).not.toContain(ids[1]);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /plan");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toMatch(/Sitemap: http:\/\/localhost:\d+\/sitemap\.xml/);
  } finally {
    await deleteCampaigns(ids);
  }
});
