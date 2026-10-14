import type { CatalogBanksResponse } from "@kartplan/shared";
import { connection } from "next/server";

import { getCatalogBanks } from "@/lib/catalog";

export async function GET() {
  // Katalog admin tarafından değişir; build sırasında önceden üretilmesin.
  await connection();
  const body: CatalogBanksResponse = { banks: await getCatalogBanks() };
  return Response.json(body);
}
