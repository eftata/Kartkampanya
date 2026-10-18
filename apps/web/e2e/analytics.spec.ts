import { expect, test } from "@playwright/test";

import { E2E_POSTHOG_URL } from "./env";
import { signUp, uniqueEmail } from "./helpers";

type CapturedEvent = {
  event: string;
  distinct_id?: string;
  properties?: Record<string, unknown>;
  raw: string;
};

async function events(): Promise<CapturedEvent[]> {
  return (await (await fetch(`${E2E_POSTHOG_URL}/events`)).json()) as CapturedEvent[];
}

test("analitik: anonim sayfa görüntüleme ve kayıt olayı kişisel veri içermez", async ({ page }) => {
  // PostHog otomasyonla açılan tarayıcıyı (navigator.webdriver, "HeadlessChrome" markası) bot
  // sayıp olay göndermez: testte bu işaretler gizlenir.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  const marker = `iz${Date.now().toString(36)}`;
  // Sorgu dizgisindeki izin verilmeyen parametre (ör. imza, e-posta) gönderilmemeli.
  await page.goto(`/kampanyalar?program=bonus&gizli=${marker}`);
  await page.getByRole("link", { name: "KartPlan" }).click();
  await expect(page).toHaveURL("/");

  await expect
    .poll(async () =>
      (await events()).some(
        (e) =>
          e.event === "$pageview" &&
          String(e.properties?.$current_url).endsWith("/kampanyalar?program=bonus"),
      ),
    )
    .toBe(true);
  expect(JSON.stringify(await events())).not.toContain(marker);

  const email = uniqueEmail("analitik");
  await signUp(page, email);
  await expect
    .poll(async () => (await events()).filter((e) => e.event === "user_signed_up").length)
    .toBeGreaterThan(0);

  const all = await events();
  const local = email.split("@")[0]!;
  expect(all.filter((e) => e.event === "__decode_error")).toEqual([]);
  // Hiçbir olayda e-posta (yerel kısmı dahil) ya da giriş bağlantısı belirteci yok.
  for (const event of all) {
    expect(event.raw).not.toContain(local);
    expect(event.raw).not.toContain("token=");
  }
  const signedUp = all.filter((e) => e.event === "user_signed_up");
  for (const event of signedUp) expect(event.distinct_id).toMatch(/^u_[A-Za-z0-9_-]{22}$/);
  // Tarayıcı olayları anonim: çerez yok, kimlik bağlanmadı.
  expect(await page.context().cookies()).not.toContainEqual(
    expect.objectContaining({ name: expect.stringMatching(/^ph_/) }),
  );
});
