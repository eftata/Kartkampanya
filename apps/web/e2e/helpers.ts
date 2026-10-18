import { createPrismaClient } from "@kartplan/db";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { getMagicLink } from "./mailpit";

export const uniqueEmail = (prefix = "e2e") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kartplan.test`;

/**
 * Rastgele test IP'si (198.18.0.0/15, kıyaslama bloğu). Sunucu istemci IP'sini
 * `x-forwarded-for`'dan okur; testler aynı makineden geldiği için IP başına sınırlar (ADR 0021)
 * birbirini etkilemesin.
 */
export const randomIp = () => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `198.${18 + Math.floor(Math.random() * 2)}.${octet()}.${octet()}`;
};

/**
 * Yeni kullanıcı kaydeder, oturum açar, KVKK onayını verir ve onboarding'e varmayı bekler; giriş
 * bağlantısını döndürür. `consent: false` → onay ekranında (`/onay`) durur.
 */
export async function signUp(
  page: Page,
  email = uniqueEmail(),
  { consent = true }: { consent?: boolean } = {},
): Promise<string> {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Giriş bağlantısı gönder" }).click();
  await expect(page).toHaveURL("/giris/dogrula");
  const magicLink = await getMagicLink(email);
  await page.goto(magicLink);
  // Yeni kullanıcı /plan'a düşer, KVKK onayı için /onay'a, onaydan sonra /baslangic'e yönlenir.
  // Yönlendirme bitmeden başka sayfaya gidilirse gezinmeler çakışır (ERR_ABORTED).
  await page.waitForURL("**/onay");
  if (!consent) return magicLink;
  const form = page.getByRole("form", { name: "KVKK onayı" });
  await form.getByLabel("okudum").check();
  await form.getByLabel("açık rıza veriyorum").check();
  await form.getByRole("button", { name: "Onayla ve devam et" }).click();
  await page.waitForURL("**/baslangic");
  return magicLink;
}

/** Kullanıcıya ADMIN rolü verir (testte yetki kurulumu; uygulamada bunun arayüzü yok). */
export async function makeAdmin(email: string): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Veri hattının yazacağı gibi kampanya oluşturur (seed'deki "bonus" programında; varsayılan DRAFT). */
export async function createDraftCampaign(
  title: string,
  options: {
    status?: "DRAFT" | "APPROVED";
    categorySlug?: string;
    rewardType?: "POINTS" | "CASHBACK";
    rewardKurus?: number;
    programSlug?: string;
    /** "YYYY-AA-GG"; varsayılan 2099 Ocak (henüz başlamamış). */
    startsAt?: string;
    endsAt?: string;
    thresholdKurus?: number;
  } = {},
): Promise<string> {
  const prisma = createPrismaClient();
  try {
    const program = await prisma.program.findUniqueOrThrow({
      where: { slug: options.programSlug ?? "bonus" },
    });
    const category = options.categorySlug
      ? await prisma.category.findUniqueOrThrow({ where: { slug: options.categorySlug } })
      : null;
    const campaign = await prisma.campaign.create({
      data: {
        programId: program.id,
        title,
        sourceUrl: `https://ornek-banka.test/e2e/${encodeURIComponent(title)}`,
        rawText:
          "SENTETİK: Markette toplam 2.500 TL harcamaya 100 TL puan. En fazla 300 TL. " +
          "Taksitli işlemler hariçtir.",
        rawHash: "e2e",
        summary: ["Markette toplam 2.500 TL harcamaya 100 TL puan"],
        startsAt: new Date(`${options.startsAt ?? "2099-01-01"}T00:00:00Z`),
        endsAt: new Date(`${options.endsAt ?? "2099-01-31"}T00:00:00Z`),
        joinMethod: "APP",
        status: options.status ?? "DRAFT",
        confidence: 0.62,
        uncertainFields: ["rules[0].cap_kurus", "merchant:Örnek Market"],
        rules: {
          create: [
            {
              categoryIds: category ? [category.id] : [],
              merchantIds: [],
              thresholdType: "CUMULATIVE",
              thresholdKurus: options.thresholdKurus ?? 250_000,
              tierRepeat: true,
              rewardType: options.rewardType ?? "POINTS",
              rewardKurus: options.rewardKurus ?? 10_000,
              capKurus: 30_000,
              exclusions: ["taksitli"],
            },
          ],
        },
      },
    });
    return campaign.id;
  } finally {
    await prisma.$disconnect();
  }
}

/** Bu ayın ilk ve son günü (Türkiye takvimi, UTC+3). */
export function currentMonth(): { first: string; last: string } {
  const today = new Date(Date.now() + 3 * 3_600_000);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    first: `${year}-${pad(month + 1)}-01`,
    last: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

export async function deleteCampaigns(ids: string[]): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await prisma.campaign.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
  }
}

export async function userIdByEmail(email: string): Promise<string> {
  const prisma = createPrismaClient();
  try {
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  } finally {
    await prisma.$disconnect();
  }
}
