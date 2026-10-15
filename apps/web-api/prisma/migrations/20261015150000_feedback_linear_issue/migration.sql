-- CreateEnum
CREATE TYPE "FeedbackLinearSource" AS ENUM ('CONTACT_SUPPORT', 'AI_APP_FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackLinearStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "FeedbackLinearIssue" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "sourceType" "FeedbackLinearSource" NOT NULL,
    "sourceUid" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "projectId" TEXT,
    "linearIssueId" TEXT NOT NULL,
    "status" "FeedbackLinearStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "identifier" TEXT,
    "url" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackLinearIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackLinearIssue_uid_key" ON "FeedbackLinearIssue"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackLinearIssue_linearIssueId_key" ON "FeedbackLinearIssue"("linearIssueId");

-- CreateIndex
CREATE INDEX "FeedbackLinearIssue_status_nextAttemptAt_idx" ON "FeedbackLinearIssue"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackLinearIssue_sourceType_sourceUid_key" ON "FeedbackLinearIssue"("sourceType", "sourceUid");
