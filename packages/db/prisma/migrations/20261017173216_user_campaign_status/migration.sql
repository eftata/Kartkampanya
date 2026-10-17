-- CreateTable
CREATE TABLE "UserCampaignStatus" (
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "joined" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "inPlan" BOOLEAN NOT NULL DEFAULT false,
    "progressKurus" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCampaignStatus_pkey" PRIMARY KEY ("userId","campaignId")
);

-- CreateIndex
CREATE INDEX "UserCampaignStatus_campaignId_idx" ON "UserCampaignStatus"("campaignId");

-- AddForeignKey
ALTER TABLE "UserCampaignStatus" ADD CONSTRAINT "UserCampaignStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCampaignStatus" ADD CONSTRAINT "UserCampaignStatus_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
