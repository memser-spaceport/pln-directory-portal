-- AlterTable: track the first time an item reached IN_PROGRESS / SHIPPED so the
-- corresponding notifications fire exactly once even if the item re-enters the stage.
ALTER TABLE "RoadmapItem" ADD COLUMN "firstInProgressAt" TIMESTAMP(3);
ALTER TABLE "RoadmapItem" ADD COLUMN "firstShippedAt" TIMESTAMP(3);

-- Backfill existing items so already-committed/shipped items do not re-notify.
-- Anything currently In Progress or Shipped has clearly reached In Progress.
UPDATE "RoadmapItem"
SET "firstInProgressAt" = COALESCE("promotedAt", "updatedAt")
WHERE "stage" IN ('IN_PROGRESS', 'SHIPPED');

-- Anything currently Shipped has been shipped.
UPDATE "RoadmapItem"
SET "firstShippedAt" = "updatedAt"
WHERE "stage" = 'SHIPPED';
