import { expect, test } from "@playwright/test";

import { E2E_CRON_SECRET } from "./env";
import {
  createDraftCampaign,
  currentMonth,
  deleteCampaigns,
  signUp,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";
import { countMails, waitForMail } from "./mailpit";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };
type Categories = { categories: { id: string; slug: string }[] };

test("bildirim işi: katılım hatırlatma e-postası, tek seferlik ve abonelikten çıkma", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/cron/notifications")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/notifications", {
        headers: { authorization: "Bearer yanlis" },
      })
    ).status(),
  ).toBe(401);

  const run = Date.now().toString(36);
  const title = `E2E bildirim ${run}`;
  const { first, last } = currentMonth();
  const ids = [
    await createDraftCampaign(title, {
      status: "APPROVED",
      categorySlug: "market",
      startsAt: first,
      endsAt: last,
    }),
  ];
  try {
    const email = uniqueEmail("bildirim");
    await signUp(page, email);
    const api = page.request;
    const { banks } = (await (await api.get("/api/catalog/banks")).json()) as Banks;
    const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
    await api.post("/api/me/cards", { data: { cardProductId: bonus.cards[0]!.id } });
    const { categories } = (await (await api.get("/api/catalog/categories")).json()) as Categories;
    const market = categories.find((c) => c.slug === "market")!;
    await api.put("/api/me/spend-profile", {
      data: { items: [{ categoryId: market.id, monthlyKurus: 400_000 }] },
    });

    const userId = await userIdByEmail(email);
    const cron = () =>
      request.get(`/api/cron/notifications?user=${userId}`, {
        headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
      });
    const response = await cron();
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ users: 1, failed: 0 });

    const subject = `"${title}" başladı`;
    const mail = await waitForMail(email, subject);
    expect(mail.text).toContain("Mobil uygulamadan katılım");
    expect(mail.text).toContain(`/kampanyalarim/${ids[0]}`);
    expect(mail.headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);

    // Aynı gün ikinci çalıştırma aynı hatırlatmayı göndermez.
    await cron();
    expect(await countMails(email, subject)).toBe(1);

    // E-postadaki bağlantı onay ister (GET ile kapatmaz), onaylayınca kapanır.
    const link = mail.text.match(/Bu bildirimleri kapat: (\S+)/)?.[1];
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page.getByText("Katılım hatırlatma e-postaları kapatılsın mı?")).toBeVisible();
    await page.getByRole("button", { name: "Evet, kapat" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Katılım hatırlatma e-postaları kapatıldı",
    );
    await page.getByRole("link", { name: "Bildirim tercihlerini değiştir" }).click();
    await expect(
      page.getByRole("form", { name: "Bildirim tercihleri" }).getByLabel("Katılım hatırlatma"),
    ).not.toBeChecked();

    // Posta istemcisinin tek tıkla çıkışı (POST) ve bozuk imza.
    const oneClick = mail.headers["List-Unsubscribe"]?.[0]?.slice(1, -1) ?? "";
    expect((await request.post(oneClick.replace("k=joinReminder", "k=all"))).status()).toBe(400);
    expect((await request.post(oneClick)).status()).toBe(204);
  } finally {
    await deleteCampaigns(ids);
  }
});

test("bildirim tercihleri: Profilim ekranı ve API", async ({ page, request }) => {
  expect((await request.get("/api/me/notifications")).status()).toBe(401);
  await signUp(page);
  const api = page.request;
  expect(await (await api.get("/api/me/notifications")).json()).toEqual({
    joinReminder: true,
    endingSoon: true,
    weeklySummary: true,
    monthlyReport: true,
  });

  await page.goto("/profil");
  const form = page.getByRole("form", { name: "Bildirim tercihleri" });
  await form.getByLabel("Haftalık plan özeti").uncheck();
  await form.getByRole("button", { name: "Tercihleri kaydet" }).click();
  await expect(form.getByRole("status")).toHaveText("Tercihlerin kaydedildi.");
  await page.reload();
  await expect(form.getByLabel("Haftalık plan özeti")).not.toBeChecked();
  await expect(form.getByLabel("Katılım hatırlatma")).toBeChecked();
  expect(await (await api.get("/api/me/notifications")).json()).toMatchObject({
    weeklySummary: false,
  });

  const all = { joinReminder: false, endingSoon: false, weeklySummary: true };
  expect((await api.put("/api/me/notifications", { data: all })).status()).toBe(200);
  expect((await api.put("/api/me/notifications", { data: { joinReminder: false } })).status()).toBe(
    400,
  );
  await page.reload();
  await expect(form.getByLabel("Katılım hatırlatma")).not.toBeChecked();
  await expect(form.getByLabel("Haftalık plan özeti")).toBeChecked();
});
