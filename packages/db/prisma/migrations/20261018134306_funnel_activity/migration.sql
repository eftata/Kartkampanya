-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstCardAt" TIMESTAMP(3),
ADD COLUMN     "firstPlanViewAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserActivityDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "UserActivityDay_day_idx" ON "UserActivityDay"("day");

-- AddForeignKey
ALTER TABLE "UserActivityDay" ADD CONSTRAINT "UserActivityDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mevcut kullanıcıların ilk kart zamanı (hâlâ duran kartlarından).
UPDATE "User" u
SET "firstCardAt" = c.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "UserCard" GROUP BY "userId") c
WHERE c."userId" = u."id" AND u."firstCardAt" IS NULL;
