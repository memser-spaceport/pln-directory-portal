-- CreateTable
CREATE TABLE "IrlGatheringPushConfig" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minAttendeesPerEvent" INTEGER NOT NULL DEFAULT 5,
    "upcomingWindowDays" INTEGER NOT NULL DEFAULT 7,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 1,
    "updatedByMemberUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IrlGatheringPushConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IrlGatheringPushConfig_uid_key" ON "IrlGatheringPushConfig"("uid");

-- CreateIndex
CREATE INDEX "IrlGatheringPushConfig_isActive_idx" ON "IrlGatheringPushConfig"("isActive");

-- CreateIndex
CREATE INDEX "IrlGatheringPushConfig_enabled_idx" ON "IrlGatheringPushConfig"("enabled");

-- CreateIndex
CREATE INDEX "IrlGatheringPushConfig_updatedAt_idx" ON "IrlGatheringPushConfig"("updatedAt");
