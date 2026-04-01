-- Make description optional
ALTER TABLE "DealRequest"
  ALTER COLUMN "description" DROP NOT NULL;

-- Make howToReachOutToYou optional
ALTER TABLE "DealRequest"
  ALTER COLUMN "howToReachOutToYou" DROP NOT NULL;
