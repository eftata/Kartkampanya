// `pnpm db:seed` (ve `prisma migrate reset`) ile çalışır; tekrar çalıştırılması güvenlidir.
import { createPrismaClient } from "../src/client";
import { seedCatalog } from "./seed-catalog";

const prisma = createPrismaClient();

async function main() {
  const catalog = await seedCatalog(prisma);
  console.log(
    `Katalog: ${catalog.banks} banka, ${catalog.programs} program, ${catalog.cards} kart, ` +
      `${catalog.categories} kategori, ${catalog.merchants} marka (oranlar doğrulanmadı).`,
  );

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: { email: adminEmail, role: "ADMIN" },
    });
    console.log(`Admin kullanıcısı hazır: ${adminEmail}`);
  } else {
    console.log("SEED_ADMIN_EMAIL boş; admin kullanıcısı oluşturulmadı.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
