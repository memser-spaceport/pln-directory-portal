-- Warm Intros v2: MasterProfile — unified person record with provenance-wrapped Json fields.
-- Link columns are plain nullable strings (no FKs) so ingest order is unconstrained.

-- CreateTable
CREATE TABLE "MasterProfile" (
    "uid" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "canonicalName" TEXT NOT NULL,
    "memberUid" TEXT,
    "affinityPersonId" TEXT,
    "investorOutreachId" TEXT,
    "emails" JSONB,
    "phones" JSONB,
    "socials" JSONB,
    "organizations" JSONB,
    "experience" JSONB,
    "education" JSONB,
    "investorMeta" JSONB,
    "funds" JSONB,
    "investedIn" JSONB,
    "locations" JSONB,
    "listMemberships" JSONB,
    "raw" JSONB,
    "sourceSnapshots" JSONB,
    "currentOrg" TEXT,
    "currentTitle" TEXT,
    "bio" TEXT,
    "contentHash" TEXT,
    "enrichmentVersion" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProfile_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_personKey_key" ON "MasterProfile"("personKey");

-- CreateIndex
CREATE INDEX "MasterProfile_memberUid_idx" ON "MasterProfile"("memberUid");

-- CreateIndex
CREATE INDEX "MasterProfile_affinityPersonId_idx" ON "MasterProfile"("affinityPersonId");

-- CreateIndex
CREATE INDEX "MasterProfile_investorOutreachId_idx" ON "MasterProfile"("investorOutreachId");
