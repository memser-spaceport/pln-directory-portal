-- AlterTable
ALTER TABLE "DealRequest"
  ADD COLUMN "whatDealAreYouLookingFor" TEXT,
  ADD COLUMN "howToReachOutToYou" TEXT;

-- Backfill from existing description so old rows remain usable
UPDATE "DealRequest"
SET
  "whatDealAreYouLookingFor" = COALESCE(NULLIF(TRIM("description"), ''), 'Not provided'),
  "howToReachOutToYou" = 'Not provided'
WHERE "whatDealAreYouLookingFor" IS NULL
   OR "howToReachOutToYou" IS NULL;

-- Make fields required after backfill
ALTER TABLE "DealRequest"
  ALTER COLUMN "whatDealAreYouLookingFor" SET NOT NULL,
  ALTER COLUMN "howToReachOutToYou" SET NOT NULL;
