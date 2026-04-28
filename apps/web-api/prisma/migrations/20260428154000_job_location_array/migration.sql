-- Convert existing location strings to single-element arrays
UPDATE "JobOpening"
SET location = ARRAY[location]
WHERE location IS NOT NULL;

-- Alter column type from text to text[]
ALTER TABLE "JobOpening"
ALTER COLUMN location TYPE text[] USING
  CASE
    WHEN location IS NULL THEN '{}'::text[]
    ELSE location::text[]
  END;

-- Set default to empty array
ALTER TABLE "JobOpening"
ALTER COLUMN location SET DEFAULT '{}'::text[];

-- Drop old index if exists
DROP INDEX IF EXISTS "JobOpening_location_idx";

-- Create GIN index for array operations
CREATE INDEX "job_opening_location_idx" ON "JobOpening" USING GIN (location);
