-- AlterTable
ALTER TABLE "Team" ADD COLUMN "dataEnrichment" JSONB;

-- CreateIndex
CREATE INDEX "Team_dataEnrichment_shouldEnrich_idx" ON "Team" USING gin ("dataEnrichment");
