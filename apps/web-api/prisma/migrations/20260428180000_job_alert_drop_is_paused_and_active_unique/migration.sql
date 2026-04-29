-- Drop the now-unused isPaused column and its composite index
DROP INDEX IF EXISTS "JobAlert_isPaused_deletedAt_idx";
ALTER TABLE "JobAlert" DROP COLUMN IF EXISTS "isPaused";

-- Replace it with a deletedAt index (used by the active-alert lookup)
CREATE INDEX IF NOT EXISTS "JobAlert_deletedAt_idx" ON "JobAlert"("deletedAt");

-- Enforce single active alert per member at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS "JobAlert_active_per_member"
  ON "JobAlert"("memberUid")
  WHERE "deletedAt" IS NULL;
