-- CreateEnum
CREATE TYPE "FounderReviewStatus" AS ENUM ('NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'HOLD');

-- CreateEnum
CREATE TYPE "FounderReviewFeedback" AS ENUM ('GOOD', 'BAD', 'WRONG_FUND', 'NEEDS_CONTEXT');

-- AlterTable
ALTER TABLE "TeamEnrichment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FounderSourcingRecord" (
    "id" SERIAL NOT NULL,
    "founderId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryEmail" TEXT,
    "github" TEXT,
    "twitter" TEXT,
    "linkedin" TEXT,
    "telegram" TEXT,
    "farcaster" TEXT,
    "website" TEXT,
    "org" TEXT,
    "team" TEXT,
    "teamPriority" INTEGER,
    "bio" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalIds" JSONB,
    "directoryMemberId" TEXT,
    "directoryTeamId" TEXT,
    "identityCompleteness" DECIMAL(5,4),
    "fundTags" JSONB,
    "fundCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plvsScore" INTEGER,
    "plvsRecommendation" TEXT,
    "plvsFeatures" JSONB,
    "plvsWeightsVersion" TEXT,
    "alignmentMax" DECIMAL(5,4),
    "quality" JSONB,
    "plnProximity" DECIMAL(5,4),
    "plAlignment" DECIMAL(5,4),
    "reputationFlags" JSONB,
    "warmIntroPaths" JSONB,
    "intentSignals" JSONB,
    "provenance" JSONB,
    "lastSignalAt" TIMESTAMP(3),
    "whyNow" VARCHAR(500),
    "thinEvidence" BOOLEAN,
    "runId" TEXT,
    "signalSourcingVersion" TEXT,
    "isKnown" BOOLEAN,
    "lastIngestRunId" TEXT,
    "lastIngestSource" TEXT,
    "reviewStatus" "FounderReviewStatus" NOT NULL DEFAULT 'NEW',
    "reviewFeedback" "FounderReviewFeedback",
    "reviewDecidedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(500),
    "reviewedByMemberUid" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderSourcingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderSourcingIngestRun" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FounderSourcingIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FounderSourcingRecord_founderId_key" ON "FounderSourcingRecord"("founderId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderSourcingRecord_dedupeKey_key" ON "FounderSourcingRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_source_idx" ON "FounderSourcingRecord"("source");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_primaryEmail_idx" ON "FounderSourcingRecord"("primaryEmail");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_reviewStatus_idx" ON "FounderSourcingRecord"("reviewStatus");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_alignmentMax_idx" ON "FounderSourcingRecord"("alignmentMax");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_lastSignalAt_idx" ON "FounderSourcingRecord"("lastSignalAt");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_runId_idx" ON "FounderSourcingRecord"("runId");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_plvsScore_idx" ON "FounderSourcingRecord"("plvsScore");

-- CreateIndex
CREATE UNIQUE INDEX "FounderSourcingIngestRun_runId_key" ON "FounderSourcingIngestRun"("runId");

-- CreateIndex
CREATE INDEX "FounderSourcingIngestRun_createdAt_idx" ON "FounderSourcingIngestRun"("createdAt");
