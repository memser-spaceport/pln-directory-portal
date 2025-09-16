-- Create new enum without ARCHIVED, with UPCOMING
CREATE TYPE "DemoDayStatus_new" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- Remove default before type switch
ALTER TABLE "DemoDay" ALTER COLUMN "status" DROP DEFAULT;

-- Map data, then switch type
ALTER TABLE "DemoDay"
ALTER COLUMN "status" TYPE "DemoDayStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING'  THEN 'UPCOMING'
      WHEN 'ARCHIVED' THEN 'COMPLETED'
      ELSE "status"::text
    END
  )::"DemoDayStatus_new";

-- Set new default
ALTER TABLE "DemoDay" ALTER COLUMN "status" SET DEFAULT 'UPCOMING';

-- Swap enum types
ALTER TYPE "DemoDayStatus" RENAME TO "DemoDayStatus_old";
ALTER TYPE "DemoDayStatus_new" RENAME TO "DemoDayStatus";
DROP TYPE "DemoDayStatus_old";
