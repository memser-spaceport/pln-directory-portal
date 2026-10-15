-- AlterTable
ALTER TABLE "Team" ADD COLUMN "locations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Each team's existing location becomes its first (HQ) location, as stored.
UPDATE "Team" SET "locations" = ARRAY["location"] WHERE "location" IS NOT NULL AND btrim("location") <> '';
