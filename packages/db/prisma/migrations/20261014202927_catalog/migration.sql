-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('CREDIT', 'DEBIT', 'VIRTUAL');

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointName" TEXT NOT NULL,
    "pointValueTL" DECIMAL(10,4) NOT NULL DEFAULT 1,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardProduct" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CardType" NOT NULL,
    "annualFee" INTEGER,
    "baseRateBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarnRate" (
    "id" TEXT NOT NULL,
    "cardProductId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,

    CONSTRAINT "EarnRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardProductId" TEXT NOT NULL,
    "nickname" TEXT,
    "limitKurus" INTEGER,
    "statementDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyKurus" INTEGER NOT NULL,
    "merchantIds" TEXT[],

    CONSTRAINT "SpendProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Program_bankId_name_key" ON "Program"("bankId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CardProduct_programId_name_key" ON "CardProduct"("programId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EarnRate_cardProductId_categoryId_key" ON "EarnRate"("cardProductId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_name_key" ON "Merchant"("name");

-- CreateIndex
CREATE INDEX "Merchant_categoryId_idx" ON "Merchant"("categoryId");

-- CreateIndex
CREATE INDEX "UserCard_userId_idx" ON "UserCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendProfile_userId_categoryId_key" ON "SpendProfile"("userId", "categoryId");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardProduct" ADD CONSTRAINT "CardProduct_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarnRate" ADD CONSTRAINT "EarnRate_cardProductId_fkey" FOREIGN KEY ("cardProductId") REFERENCES "CardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarnRate" ADD CONSTRAINT "EarnRate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_cardProductId_fkey" FOREIGN KEY ("cardProductId") REFERENCES "CardProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendProfile" ADD CONSTRAINT "SpendProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendProfile" ADD CONSTRAINT "SpendProfile_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
