-- Add dedupKey column to JobOpening (nullable initially for backfill)
ALTER TABLE "JobOpening" ADD COLUMN "dedupKey" TEXT;

-- Backfill dedupKey: prefer sourceLink when present, fallback to canonicalKey
UPDATE "JobOpening"
SET "dedupKey" = COALESCE("sourceLink", "canonicalKey")
WHERE "dedupKey" IS NULL;

-- Handle duplicate dedupKey values by preferring active status, then newest updatedAt
-- Step 1: Identify rows that will be kept vs marked as duplicates
WITH RankedDuplicates AS (
  SELECT
    id,
    "dedupKey",
    status,
    "updatedAt",
    ROW_NUMBER() OVER (
      PARTITION BY "dedupKey"
      ORDER BY
        -- Prefer active/non-terminal statuses (NEW, CONFIRMED, ROUTED_TO_WS4, STALE)
        CASE
          WHEN status IN ('NEW', 'CONFIRMED', 'ROUTED_TO_WS4', 'STALE') THEN 0
          ELSE 1
        END ASC,
        "updatedAt" DESC
    ) AS rn
  FROM "JobOpening"
  WHERE "dedupKey" IS NOT NULL
),
DuplicatesToFix AS (
  SELECT id, "dedupKey"
  FROM RankedDuplicates
  WHERE rn > 1
)
-- Step 2: Update duplicate rows: set status to CLOSED_DUPLICATE and make dedupKey unique
UPDATE "JobOpening" jo
SET
  "dedupKey" = jo."dedupKey" || '#dup:' || jo.id::text,
  status = 'CLOSED_DUPLICATE'
FROM DuplicatesToFix dtf
WHERE jo.id = dtf.id;

-- Now make dedupKey NOT NULL (all rows have been assigned a value)
ALTER TABLE "JobOpening" ALTER COLUMN "dedupKey" SET NOT NULL;

-- Create unique index on dedupKey
CREATE UNIQUE INDEX "JobOpening_dedupKey_key" ON "JobOpening"("dedupKey");

-- Drop the old unique constraint on canonicalKey (keep the column, just not unique)
DROP INDEX IF EXISTS "JobOpening_canonicalKey_key";
