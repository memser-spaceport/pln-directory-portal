-- AlterTable
ALTER TABLE "FounderSourcingRecord" ADD COLUMN     "lastActivitySeenAt" TIMESTAMP(3),
ADD COLUMN     "criteriaHeadline" VARCHAR(500),
ADD COLUMN     "pedigree" VARCHAR(500),
ADD COLUMN     "focusArea" TEXT,
ADD COLUMN     "isRaising" BOOLEAN,
ADD COLUMN     "isCofounderSearch" BOOLEAN,
ADD COLUMN     "isComingOutOfStealth" BOOLEAN,
ADD COLUMN     "nearNetwork" BOOLEAN,
ADD COLUMN     "plAligned" BOOLEAN,
ADD COLUMN     "reviewChannel" TEXT,
ADD COLUMN     "reviewField" VARCHAR(80),
ADD COLUMN     "reviewArea" VARCHAR(80);

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_focusArea_idx" ON "FounderSourcingRecord"("focusArea");

-- CreateIndex
CREATE INDEX "FounderSourcingRecord_isRaising_idx" ON "FounderSourcingRecord"("isRaising");

-- CreateTable
CREATE TABLE "FounderSourcingMethodology" (
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FounderSourcingMethodology_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE INDEX "FounderSourcingMethodology_createdAt_idx" ON "FounderSourcingMethodology"("createdAt");
