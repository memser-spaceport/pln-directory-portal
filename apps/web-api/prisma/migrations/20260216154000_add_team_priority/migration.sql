-- Add Priority column to Team.
--
-- Priority semantics:
--   1 = highest importance
--   5 = lowest importance
--   99 = NA (Not Assigned)
--
-- We keep `tier` for backward compatibility. During the transition we store BOTH values.

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 99;

-- Backfill priority from existing tier where possible.
-- tier: 4 -> priority 1
-- tier: 3 -> priority 2
-- tier: 2 -> priority 3
-- tier: 1 -> priority 4
-- tier: 0 -> priority 5
-- other / NA -> 99
UPDATE "Team"
SET "priority" = CASE
  WHEN "tier" BETWEEN 0 AND 4 THEN 5 - "tier"
  ELSE 99
END
WHERE "priority" IS NULL OR "priority" = 99;
