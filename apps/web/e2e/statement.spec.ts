import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";
import { makePdf } from "./pdf";

type Banks = { banks: { programs: { slug: string; cards: { id: string }[] }[] }[] };

const turkeyToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

test("ekstre PDF'i: satırlar çıkarılır, onaylananlar harcama olur, tekrar yüklemede mükerrer", async ({
  page,
}) => {
  const [year, month, day] = turkeyToday().split("-");
  const date = `${day}.${month}.${year}`;
  // SENTETİK ekstre: bir tanınan marka, bir tanınmayan işyeri, bir ödeme.
  const pdf = makePdf([
    "ORNEK BANK HESAP OZETI",
    `${date} MIGROS KADIKOY ISTANBUL 450,00`,
    `${date} BILINMEYEN ISYERI 120,00`,
    `${date} ODEME TESEKKURLER -5.000,00`,
  ]);

  await signUp(page);
  const { banks } = (await (await page.request.get("/api/catalog/banks")).json()) as Banks;
  const bonus = banks.flatMap((b) => b.programs).find((p) => p.slug === "bonus")!;
  await page.request.post("/api/me/cards", { data: { cardProductId: bonus.cards[0]!.id } });

  await page.goto("/harcamalar");
  await page.getByRole("link", { name: /Ekstre PDF.ini yükleyip/ }).click();
  await expect(page).toHaveURL("/harcamalar/ekstre");

  // PDF olmayan dosya.
  const form = page.getByRole("form", { name: "Ekstre yükle" });
  await form.getByLabel(/Ekstre PDF/).setInputFiles({
    name: "ekstre.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("bu bir pdf değil"),
  });
  await form.getByRole("button", { name: "Ekstreyi oku" }).click();
  await expect(form.getByRole("alert")).toContainText("Dosya okunamadı");

  await form.getByLabel(/Ekstre PDF/).setInputFiles({
    name: "ekstre.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await form.getByRole("button", { name: "Ekstreyi oku" }).click();
  await expect(
    page.getByText("2 harcama satırı bulundu · 1 ödeme/iade satırı atlandı"),
  ).toBeVisible();

  const table = page.getByRole("table", { name: "Ekstre satırları" });
  await expect(table.getByLabel("MIGROS KADIKOY ISTANBUL kategorisi")).toHaveValue(/.+/);
  const add = page.getByRole("button", { name: /Seçilenleri ekle/ });
  await expect(add).toHaveText("Seçilenleri ekle (2)");
  await expect(add).toBeDisabled(); // tanınmayan satırın kategorisi yok
  await table.getByLabel("BILINMEYEN ISYERI kategorisi").selectOption({ label: "Giyim" });
  await add.click();
  await expect(page.getByRole("status")).toContainText("2 harcama eklendi.");

  const list = (await (await page.request.get("/api/me/transactions")).json()) as {
    transactions: { amountKurus: number; categoryName: string; merchantName: string | null }[];
  };
  expect(
    list.transactions.map((t) => [t.amountKurus, t.categoryName, t.merchantName]).sort(),
  ).toEqual(
    [
      [12_000, "Giyim", null],
      [45_000, "Market", "Migros"],
    ].sort(),
  );

  // Aynı ekstre tekrar: satırlar "zaten girilmiş" ve seçili gelmez.
  await page.getByRole("link", { name: "Harcamalara dön" }).click();
  await page.goto("/harcamalar/ekstre");
  await form.getByLabel(/Ekstre PDF/).setInputFiles({
    name: "ekstre.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await form.getByRole("button", { name: "Ekstreyi oku" }).click();
  await expect(page.getByText("Zaten girilmiş olabilir")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Seçilenleri ekle/ })).toHaveText(
    "Seçilenleri ekle (0)",
  );
});
