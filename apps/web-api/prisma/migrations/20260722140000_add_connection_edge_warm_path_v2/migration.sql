-- Warm Intros v2: ConnectionEdge + WarmPathV2.
-- Profile uids are plain strings (no FKs) so ingest order is unconstrained — same as MasterProfile.
-- Iteration 1 relationKind = pl_direct; WarmPathV2 is materialized from ConnectionEdges for API/UI.

-- CreateTable
CREATE TABLE "ConnectionEdge" (
    "uid" TEXT NOT NULL,
    "fromProfileUid" TEXT NOT NULL,
    "toProfileUid" TEXT NOT NULL,
    "relationKind" VARCHAR(32) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "reasons" JSONB NOT NULL,
    "hintsUsed" JSONB,
    "provider" VARCHAR(32),
    "model" VARCHAR(64),
    "promptVersion" VARCHAR(64),
    "runId" VARCHAR(64),
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionEdge_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "WarmPathV2" (
    "uid" TEXT NOT NULL,
    "targetProfileUid" TEXT NOT NULL,
    "targetSet" VARCHAR(120) NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "hopCount" INTEGER NOT NULL,
    "hopChain" JSONB NOT NULL,
    "bestConnectorProfileUid" TEXT,
    "alternateConnectorProfileUids" JSONB,
    "runId" VARCHAR(64),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarmPathV2_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionEdge_fromProfileUid_toProfileUid_relationKind_key" ON "ConnectionEdge"("fromProfileUid", "toProfileUid", "relationKind");

-- CreateIndex
CREATE INDEX "ConnectionEdge_toProfileUid_idx" ON "ConnectionEdge"("toProfileUid");
 
-- CreateIndex
CREATE INDEX "ConnectionEdge_fromProfileUid_idx" ON "ConnectionEdge"("fromProfileUid");

-- CreateIndex
CREATE INDEX "ConnectionEdge_runId_idx" ON "ConnectionEdge"("runId");

-- CreateIndex
CREATE INDEX "ConnectionEdge_relationKind_idx" ON "ConnectionEdge"("relationKind");

-- CreateIndex
CREATE UNIQUE INDEX "WarmPathV2_targetProfileUid_targetSet_rank_key" ON "WarmPathV2"("targetProfileUid", "targetSet", "rank");

-- CreateIndex
CREATE INDEX "WarmPathV2_targetProfileUid_idx" ON "WarmPathV2"("targetProfileUid");

-- CreateIndex
CREATE INDEX "WarmPathV2_targetSet_idx" ON "WarmPathV2"("targetSet");

-- CreateIndex
CREATE INDEX "WarmPathV2_targetProfileUid_rank_idx" ON "WarmPathV2"("targetProfileUid", "rank");

-- CreateIndex
CREATE INDEX "WarmPathV2_runId_idx" ON "WarmPathV2"("runId");
