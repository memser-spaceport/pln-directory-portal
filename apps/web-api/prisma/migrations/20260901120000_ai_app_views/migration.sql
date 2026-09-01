-- AlterTable
ALTER TABLE "AiApp" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiAppActiveMember" (
    "appUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAppActiveMember_pkey" PRIMARY KEY ("appUid","memberUid")
);

-- CreateIndex
CREATE INDEX "AiAppActiveMember_appUid_lastSeenAt_idx" ON "AiAppActiveMember"("appUid", "lastSeenAt");
