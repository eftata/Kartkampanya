import "server-only";

import { getPrisma } from "@kartplan/db";
import type { CatalogBank } from "@kartplan/shared";

/** Onboarding için banka → program → kart ağacı (adlara göre sıralı). */
export async function getCatalogBanks(): Promise<CatalogBank[]> {
  const banks = await getPrisma().bank.findMany({
    orderBy: { name: "asc" },
    include: {
      programs: {
        orderBy: { name: "asc" },
        include: { cards: { orderBy: { name: "asc" } } },
      },
    },
  });
  return banks
    .map((bank) => ({
      id: bank.id,
      name: bank.name,
      programs: bank.programs
        .map((program) => ({
          id: program.id,
          slug: program.slug,
          name: program.name,
          pointName: program.pointName,
          cards: program.cards.map((card) => ({ id: card.id, name: card.name, type: card.type })),
        }))
        .filter((program) => program.cards.length > 0),
    }))
    .filter((bank) => bank.programs.length > 0);
}
