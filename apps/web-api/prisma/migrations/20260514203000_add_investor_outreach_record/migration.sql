-- CreateTable
CREATE TABLE "InvestorOutreachRecord" (
    "id" SERIAL NOT NULL,
    "investorId" TEXT NOT NULL,
    "canonicalId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "emailStatus" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "firm" TEXT,
    "firmDomain" TEXT,
    "title" CHARACTER VARYING(120),
    "investorType" TEXT NOT NULL,
    "fundThesis" TEXT,
    "aumRange" TEXT,
    "checkSizeRange" TEXT,
    "stageFocus" TEXT NOT NULL,
    "sectorTags" TEXT,
    "geoFocus" CHARACTER VARYING(120),
    "recentDeals" CHARACTER VARYING(200),
    "outreachTouches" INTEGER NOT NULL DEFAULT 0,
    "outreachCampaigns" TEXT,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "registered" INTEGER NOT NULL DEFAULT 0,
    "firstSentDate" DATE,
    "lastSentDate" DATE,
    "engagementTier" TEXT NOT NULL,
    "enrichmentStatus" TEXT NOT NULL,
    "enrichmentDate" DATE,
    "lastEnrichmentAttempt" TIMESTAMP(3),
    "enrichmentNotes" CHARACTER VARYING(500),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorOutreachRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorOutreachRecord_investorId_key" ON "InvestorOutreachRecord"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorOutreachRecord_dedupeKey_key" ON "InvestorOutreachRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_canonicalId_idx" ON "InvestorOutreachRecord"("canonicalId");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_source_idx" ON "InvestorOutreachRecord"("source");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_emailStatus_idx" ON "InvestorOutreachRecord"("emailStatus");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_engagementTier_idx" ON "InvestorOutreachRecord"("engagementTier");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_enrichmentStatus_idx" ON "InvestorOutreachRecord"("enrichmentStatus");

-- CreateIndex
CREATE INDEX "InvestorOutreachRecord_enrichmentDate_idx" ON "InvestorOutreachRecord"("enrichmentDate");
