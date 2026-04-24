-- CreateEnum
CREATE TYPE "DataDiscrepancyFlag" AS ENUM ('DEAD_URL', 'EMPTY_BOARD', 'MULTI_BOARD');

-- CreateTable
CREATE TABLE "TeamJobEnrichment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "careersPageUrl" TEXT,
    "openRolesCount" INTEGER,
    "lastEnrichmentDate" TIMESTAMP(3),
    "enrichmentSource" TEXT,
    "dataDiscrepancyFlag" "DataDiscrepancyFlag",
    "discrepancyDetails" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamJobEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamJobEnrichment_uid_key" ON "TeamJobEnrichment"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamJobEnrichment_teamUid_key" ON "TeamJobEnrichment"("teamUid");

-- CreateIndex
CREATE INDEX "TeamJobEnrichment_teamUid_idx" ON "TeamJobEnrichment"("teamUid");

-- CreateIndex
CREATE INDEX "TeamJobEnrichment_needsReview_idx" ON "TeamJobEnrichment"("needsReview");

-- CreateIndex
CREATE INDEX "TeamJobEnrichment_dataDiscrepancyFlag_idx" ON "TeamJobEnrichment"("dataDiscrepancyFlag");

-- AddForeignKey
ALTER TABLE "TeamJobEnrichment" ADD CONSTRAINT "TeamJobEnrichment_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
