-- AlterEnum
ALTER TYPE "PushNotificationCategory" ADD VALUE 'IRL_GATHERING';

-- CreateEnum
CREATE TYPE "IrlGatheringPushRuleKind" AS ENUM ('UPCOMING', 'REMINDER');

-- CreateTable
CREATE TABLE "IrlGatheringPushCandidate"
(
  "id"             SERIAL                     NOT NULL,
  "uid"            TEXT                       NOT NULL,
  "ruleKind"       "IrlGatheringPushRuleKind" NOT NULL,
  "gatheringUid"   TEXT                       NOT NULL,
  "eventUid"       TEXT                       NOT NULL,
  "eventStartDate" TIMESTAMP(3)               NOT NULL,
  "attendeeCount"  INTEGER                    NOT NULL,
  "isSuppressed"   BOOLEAN                    NOT NULL DEFAULT false,
  "processedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)               NOT NULL,

  CONSTRAINT "IrlGatheringPushCandidate_pkey" PRIMARY KEY ("id")
);




-- CreateIndex
CREATE UNIQUE INDEX "IrlGatheringPushCandidate_uid_key" ON "IrlGatheringPushCandidate"("uid");

-- CreateIndex
CREATE INDEX "IrlGatheringPushCandidate_ruleKind_gatheringUid_idx" ON "IrlGatheringPushCandidate"("ruleKind", "gatheringUid");

-- CreateIndex
CREATE INDEX "IrlGatheringPushCandidate_ruleKind_processedAt_idx" ON "IrlGatheringPushCandidate"("ruleKind", "processedAt");

-- CreateIndex
CREATE INDEX "IrlGatheringPushCandidate_eventStartDate_idx" ON "IrlGatheringPushCandidate"("eventStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "IrlGatheringPushCandidate_ruleKind_eventUid_key" ON "IrlGatheringPushCandidate"("ruleKind", "eventUid");
