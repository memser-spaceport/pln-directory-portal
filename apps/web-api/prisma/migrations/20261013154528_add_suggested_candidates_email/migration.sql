-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "suggestedCandidatesEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "JobMatchEmailSend" (
    "uid" TEXT NOT NULL,
    "runUid" TEXT NOT NULL,
    "roleUid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "recipientUid" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatchEmailSend_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "JobMatchEmailSend_recipientUid_idx" ON "JobMatchEmailSend"("recipientUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchEmailSend_runUid_roleUid_recipientUid_key" ON "JobMatchEmailSend"("runUid", "roleUid", "recipientUid");

-- AddForeignKey
ALTER TABLE "JobMatchEmailSend" ADD CONSTRAINT "JobMatchEmailSend_runUid_fkey" FOREIGN KEY ("runUid") REFERENCES "JobMatchRun"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

