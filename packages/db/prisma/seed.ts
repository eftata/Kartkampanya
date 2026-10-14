// `pnpm db:seed` (ve `prisma migrate reset`) ile çalışır; tekrar çalıştırılması güvenlidir.
// Sprint 1'de banka/program/kart kataloğu buraya eklenecek.
import { createPrismaClient } from "../src/client";

const prisma = createPrismaClient();

async function main() {
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
