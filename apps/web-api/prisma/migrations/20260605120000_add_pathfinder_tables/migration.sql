-- PL Path Finder v1: 3 dedicated tables + 2 additive fields on InvestorOutreachRecord.
-- Produced by the offline graph job (pln-data-enrichment) and served via the Investor DB warm-intros workspace.

-- AlterTable
ALTER TABLE "InvestorOutreachRecord" ADD COLUMN     "bestProximityCode" VARCHAR(16),
ADD COLUMN     "hasPath" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PathfinderPath" (
    "id" SERIAL NOT NULL,
    "targetInvestorId" TEXT NOT NULL,
    "targetSet" VARCHAR(120) NOT NULL,
    "connectorType" VARCHAR(8) NOT NULL,
    "hops" INTEGER NOT NULL,
    "caliber" VARCHAR(2),
    "proximityCode" VARCHAR(16) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "caliberConfidence" DOUBLE PRECISION,
    "hopChain" JSONB NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestRunId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathfinderPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathfinderEntityCrosswalk" (
    "id" SERIAL NOT NULL,
    "canonicalId" VARCHAR(64) NOT NULL,
    "directoryUid" VARCHAR(64),
    "affinityId" VARCHAR(64),
    "investorId" VARCHAR(64),
    "entityType" VARCHAR(16) NOT NULL,
    "displayName" VARCHAR(200),
    "firm" VARCHAR(200),
    "matchMethod" VARCHAR(32) NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isFounderLpLink" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "ingestRunId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathfinderEntityCrosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathfinderCorrection" (
    "id" SERIAL NOT NULL,
    "subjectType" VARCHAR(24) NOT NULL,
    "subjectId" VARCHAR(64) NOT NULL,
    "field" VARCHAR(48) NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "note" VARCHAR(1000),
    "actorUid" VARCHAR(64),
    "actorEmail" VARCHAR(200),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathfinderCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PathfinderPath_targetInvestorId_idx" ON "PathfinderPath"("targetInvestorId");

-- CreateIndex
CREATE INDEX "PathfinderPath_targetSet_idx" ON "PathfinderPath"("targetSet");

-- CreateIndex
CREATE INDEX "PathfinderPath_connectorType_idx" ON "PathfinderPath"("connectorType");

-- CreateIndex
CREATE INDEX "PathfinderPath_targetInvestorId_rank_idx" ON "PathfinderPath"("targetInvestorId", "rank");

-- CreateIndex
CREATE INDEX "PathfinderEntityCrosswalk_canonicalId_idx" ON "PathfinderEntityCrosswalk"("canonicalId");

-- CreateIndex
CREATE INDEX "PathfinderEntityCrosswalk_directoryUid_idx" ON "PathfinderEntityCrosswalk"("directoryUid");

-- CreateIndex
CREATE INDEX "PathfinderEntityCrosswalk_affinityId_idx" ON "PathfinderEntityCrosswalk"("affinityId");

-- CreateIndex
CREATE INDEX "PathfinderEntityCrosswalk_investorId_idx" ON "PathfinderEntityCrosswalk"("investorId");

-- CreateIndex
CREATE INDEX "PathfinderEntityCrosswalk_needsReview_idx" ON "PathfinderEntityCrosswalk"("needsReview");

-- CreateIndex
CREATE INDEX "PathfinderCorrection_subjectType_subjectId_idx" ON "PathfinderCorrection"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "PathfinderCorrection_field_idx" ON "PathfinderCorrection"("field");

-- CreateIndex
CREATE INDEX "PathfinderCorrection_appliedAt_idx" ON "PathfinderCorrection"("appliedAt");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_hasPath_idx" ON "InvestorOutreachRecord"("hasPath");

-- AddForeignKey
ALTER TABLE "PathfinderPath" ADD CONSTRAINT "PathfinderPath_targetInvestorId_fkey" FOREIGN KEY ("targetInvestorId") REFERENCES "InvestorOutreachRecord"("investorId") ON DELETE CASCADE ON UPDATE CASCADE;
