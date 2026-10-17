import { expect, test } from "@playwright/test";

import { makeAdmin, signUp, uniqueEmail } from "./helpers";

test("admin olmayan kullanıcı admin bölümünü göremez", async ({ page, request }) => {
  expect((await request.get("/api/admin/catalog")).status()).toBe(401);

  await signUp(page);
  await page.goto("/admin/katalog");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await expect(page.getByText("Admin")).toHaveCount(0);
  await expect(page.getByText("Banka ekle")).toHaveCount(0);

  expect((await page.request.get("/api/admin/catalog")).status()).toBe(403);
  expect(
    (await page.request.post("/api/admin/catalog/banks", { data: { name: "X Bank" } })).status(),
  ).toBe(403);
});

test("admin katalogu yönetir, oranları doğrular ve işlem kaydı tutulur", async ({ page }) => {
  const run = Date.now().toString(36);
  const email = uniqueEmail("admin");
  page.on("dialog", (dialog) => dialog.accept());

  await signUp(page, email);
  await makeAdmin(email);
  await page.goto("/kartlarim");
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL("/admin/katalog");
  await expect(page.getByTestId("verification-summary")).toContainText("Oranı doğrulanan kart:");

  // Banka
  const bankName = `E2E Bankası ${run}`;
  const addBank = page.getByRole("form", { name: "Banka ekle" });
  await addBank.getByLabel("Banka adı").fill(bankName);
  await addBank.getByRole("button", { name: "Bankayı ekle" }).click();
  await expect(addBank.getByRole("status")).toHaveText("Banka eklendi.");
  await expect(page.getByText(bankName)).toBeVisible();

  // Program (aynı bankanın kartında)
  const bankCard = page.locator("[data-slot=card]").filter({ hasText: bankName });
  await bankCard.getByText("Program ekle").click();
  const addProgram = page.getByRole("form", { name: `${bankName} program ekle` });
  await addProgram.getByLabel("Program adı").fill("E2Epuan");
  await addProgram.getByLabel("Kısa ad").fill("Hatalı Kısa Ad");
  await addProgram.getByLabel("Puan adı").fill("EP");
  await addProgram.getByRole("button", { name: "Programı ekle" }).click();
  await expect(addProgram.getByRole("alert")).toContainText("Kısa ad yalnızca küçük harf");
  // Hata sonrası girilen değerler korunur.
  await expect(addProgram.getByLabel("Program adı")).toHaveValue("E2Epuan");
  await addProgram.getByLabel("Kısa ad").fill(`e2e-${run}`);
  await addProgram.getByRole("button", { name: "Programı ekle" }).click();
  await expect(page).toHaveURL(/\/admin\/katalog\/program\//);
  await expect(page.getByRole("heading", { name: `${bankName} · E2Epuan` })).toBeVisible();

  // Puan değerini doğrula
  const programForm = page.getByRole("form", { name: "Program bilgileri" });
  await programForm.getByLabel("1 puan kaç TL?").fill("0,5");
  await programForm.getByLabel("Puan değerini banka kaynağından doğruladım").check();
  await programForm.getByRole("button", { name: "Kaydet" }).click();
  await expect(programForm.getByRole("status")).toHaveText("Program kaydedildi.");
  await expect(page.getByTestId("program-status")).toHaveText("Doğrulandı");

  // Kart
  const addCard = page.getByRole("form", { name: "Kart ekle" });
  await addCard.getByLabel("Kart adı").fill("E2E Platinum");
  await addCard.getByRole("button", { name: "Kartı ekle" }).click();
  await expect(page).toHaveURL(/\/admin\/katalog\/kart\//);
  await expect(page.getByRole("heading", { name: "E2E Platinum" })).toBeVisible();
  await expect(page.getByTestId("card-status")).toHaveText("Doğrulanmadı");

  // Oranlar: geçersiz giriş korunur, sonra doğrulanır
  const cardForm = page.getByRole("form", { name: "Kart ve kazanç oranları" });
  await cardForm.getByLabel("Temel oran (%)").fill("0,5");
  await cardForm.getByLabel("Market").fill("abc");
  await cardForm.getByRole("button", { name: "Kaydet" }).click();
  await expect(cardForm.getByRole("alert")).toContainText("Market: oranı yüzde olarak yaz");
  await expect(cardForm.getByLabel("Temel oran (%)")).toHaveValue("0,5");

  await cardForm.getByLabel("Market").fill("1,25");
  await cardForm
    .getByLabel("Temel oranı ve kategori oranlarını banka kaynağından doğruladım")
    .check();
  await cardForm.getByRole("button", { name: "Kaydet" }).click();
  await expect(cardForm.getByRole("status")).toHaveText("Kart kaydedildi.");
  await expect(page.getByTestId("card-status")).toHaveText("Doğrulandı");
  const history = page.getByRole("region", { name: "Kartın işlem geçmişi" });
  await expect(history).toContainText("Oranlar doğrulandı");
  await expect(history).toContainText(email);

  await page.reload();
  await expect(cardForm.getByLabel("Market")).toHaveValue("1,25");

  // Oran değişip doğrulama işaretlenmezse doğrulama kalkar
  await cardForm.getByLabel("Temel oran (%)").fill("0,75");
  await cardForm
    .getByLabel("Temel oranı ve kategori oranlarını banka kaynağından doğruladım")
    .uncheck();
  await cardForm.getByRole("button", { name: "Kaydet" }).click();
  await expect(cardForm.getByRole("status")).toHaveText("Kart kaydedildi.");
  await expect(page.getByTestId("card-status")).toHaveText("Doğrulanmadı");

  // Silme: kart → program → banka
  await page.getByRole("button", { name: "Kartı sil" }).click();
  await expect(page).toHaveURL(/\/admin\/katalog\/program\//);
  await page.getByRole("button", { name: "Programı sil" }).click();
  await expect(page).toHaveURL("/admin/katalog");
  await page
    .locator("[data-slot=card]")
    .filter({ hasText: bankName })
    .getByRole("button", { name: "Bankayı sil" })
    .click();
  // Next 16 önceki sayfaları gizli tutar (UI durumu korunur); yalnızca görünür öğeler sayılır.
  await expect(page.getByText(bankName).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Son işlemler" })).toContainText("Banka silindi");
});

test("admin katalog API'si: oluşturma, çakışma, oranlar ve silme", async ({ page }) => {
  const run = Date.now().toString(36);
  const email = uniqueEmail("admin-api");
  await signUp(page, email);
  await makeAdmin(email);
  const api = page.request;

  const bank = await api.post("/api/admin/catalog/banks", { data: { name: `API Bankası ${run}` } });
  expect(bank.status()).toBe(201);
  const { id: bankId } = (await bank.json()) as { id: string };
  expect(
    (await api.post("/api/admin/catalog/banks", { data: { name: `API Bankası ${run}` } })).status(),
  ).toBe(409);

  const program = await api.post("/api/admin/catalog/programs", {
    data: { bankId, slug: `api-${run}`, name: "APIpuan", pointName: "AP", pointValueTL: "1" },
  });
  expect(program.status()).toBe(201);
  const { id: programId } = (await program.json()) as { id: string };
  expect(
    (
      await api.post("/api/admin/catalog/programs", {
        data: { bankId: "yok", slug: `x-${run}`, name: "X", pointName: "X", pointValueTL: "1" },
      })
    ).status(),
  ).toBe(400);

  const card = await api.post("/api/admin/catalog/cards", {
    data: { programId, name: "API Kart", type: "CREDIT" },
  });
  expect(card.status()).toBe(201);
  const { id: cardId } = (await card.json()) as { id: string };

  const categories = (await (await api.get("/api/catalog/categories")).json()) as {
    categories: { id: string; slug: string }[];
  };
  const fuel = categories.categories.find((c) => c.slug === "akaryakit")!;
  expect(
    (
      await api.patch(`/api/admin/catalog/cards/${cardId}`, {
        data: {
          baseRateBps: 50,
          rates: [{ categoryId: fuel.id, rateBps: 100 }],
          ratesVerified: true,
        },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await api.patch(`/api/admin/catalog/cards/${cardId}`, { data: { baseRateBps: 5000 } })
    ).status(),
  ).toBe(400);

  const tree = (await (await api.get("/api/admin/catalog")).json()) as {
    banks: {
      id: string;
      programs: { cards: { id: string; baseRateBps: number; ratesVerifiedAt: string | null }[] }[];
    }[];
  };
  const saved = tree.banks.find((b) => b.id === bankId)!.programs[0]!.cards[0]!;
  expect(saved).toMatchObject({ id: cardId, baseRateBps: 50 });
  expect(saved.ratesVerifiedAt).not.toBeNull();

  expect((await api.delete(`/api/admin/catalog/programs/${programId}`)).status()).toBe(409);
  expect((await api.delete(`/api/admin/catalog/cards/${cardId}`)).status()).toBe(204);
  expect((await api.delete(`/api/admin/catalog/cards/${cardId}`)).status()).toBe(404);
  expect((await api.delete(`/api/admin/catalog/programs/${programId}`)).status()).toBe(204);
  expect((await api.delete(`/api/admin/catalog/banks/${bankId}`)).status()).toBe(204);
});
