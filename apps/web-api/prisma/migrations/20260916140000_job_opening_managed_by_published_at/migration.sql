-- CreateEnum
CREATE TYPE "JobOpeningManagedBy" AS ENUM ('ENRICHMENT', 'INTEGRATION', 'MANUAL');

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "managedBy" "JobOpeningManagedBy",
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "JobOpening_publishedAt_idx" ON "JobOpening"("publishedAt");

-- Rows already visible on the board count as published when they were created.
-- Hidden rows stay NULL; the ingest stamps them if they ever become visible again.
-- managedBy is left NULL on purpose: NULL is read as ENRICHMENT everywhere.
UPDATE "JobOpening"
SET "publishedAt" = "createdAt"
WHERE "status" NOT IN ('STALE', 'CLOSED_DUPLICATE', 'CLOSED_INCORRECT_SIGNAL', 'CLOSED_NOT_HIRING_SIGNAL', 'CLOSED_ROLE_FILLED');
