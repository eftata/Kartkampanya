-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "Feedback_campaignId_status_idx" ON "Feedback"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
