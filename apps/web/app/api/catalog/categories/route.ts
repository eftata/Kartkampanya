import type { CatalogCategoriesResponse } from "@kartplan/shared";
import { connection } from "next/server";

import { getSpendCategories } from "@/lib/spend-profile";

export async function GET() {
  // Katalog admin tarafından değişir; build sırasında önceden üretilmesin.
  await connection();
  const body: CatalogCategoriesResponse = { categories: await getSpendCategories() };
  return Response.json(body);
}
