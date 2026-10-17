-- CreateEnum
CREATE TYPE "JoinMethod" AS ENUM ('AUTO', 'SMS', 'APP', 'WEB');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Threshold" AS ENUM ('SINGLE', 'CUMULATIVE', 'TXN_COUNT');

-- CreateEnum
CREATE TYPE "Reward" AS ENUM ('POINTS', 'CASHBACK', 'DISCOUNT', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "CampaignSource" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "listUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "rawHash" TEXT NOT NULL,
    "summary" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "joinMethod" "JoinMethod" NOT NULL,
    "joinDeadline" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "confidence" DOUBLE PRECISION,
    "uncertainFields" TEXT[],
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCard" (
    "campaignId" TEXT NOT NULL,
    "cardProductId" TEXT NOT NULL,

    CONSTRAINT "CampaignCard_pkey" PRIMARY KEY ("campaignId","cardProductId")
);

-- CreateTable
CREATE TABLE "CampaignRule" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "merchantIds" TEXT[],
    "thresholdType" "Threshold" NOT NULL,
    "thresholdKurus" INTEGER,
    "txnCount" INTEGER,
    "tierRepeat" BOOLEAN NOT NULL DEFAULT false,
    "rewardType" "Reward" NOT NULL,
    "rewardKurus" INTEGER,
    "rewardBps" INTEGER,
    "capKurus" INTEGER,
    "exclusions" TEXT[],

    CONSTRAINT "CampaignRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "found" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSource_adapter_key" ON "CampaignSource"("adapter");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_sourceUrl_key" ON "Campaign"("sourceUrl");

-- CreateIndex
CREATE INDEX "Campaign_status_endsAt_idx" ON "Campaign"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Campaign_programId_status_idx" ON "Campaign"("programId", "status");

-- CreateIndex
CREATE INDEX "CampaignRule_campaignId_idx" ON "CampaignRule"("campaignId");

-- CreateIndex
CREATE INDEX "PipelineRun_sourceId_startedAt_idx" ON "PipelineRun"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "CampaignSource" ADD CONSTRAINT "CampaignSource_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CampaignSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCard" ADD CONSTRAINT "CampaignCard_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCard" ADD CONSTRAINT "CampaignCard_cardProductId_fkey" FOREIGN KEY ("cardProductId") REFERENCES "CardProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRule" ADD CONSTRAINT "CampaignRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CampaignSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
