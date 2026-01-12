-- Add human-readable description to IRL gathering locations
ALTER TABLE "PLEventLocation" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Extend IRL push config with group-level thresholds
ALTER TABLE "IrlGatheringPushConfig"
  ADD COLUMN IF NOT EXISTS "totalEventsThreshold" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "qualifiedEventsThreshold" INTEGER NOT NULL DEFAULT 2;

-- Store event end date on candidate rows so the job can include in-progress events
ALTER TABLE "IrlGatheringPushCandidate" ADD COLUMN IF NOT EXISTS "eventEndDate" TIMESTAMP(3);

-- Backfill existing candidates from events table
UPDATE "IrlGatheringPushCandidate" c
SET "eventEndDate" = e."endDate"
FROM "PLEvent" e
WHERE c."eventUid" = e."uid" AND c."eventEndDate" IS NULL;

-- Ensure the column is non-null going forward
ALTER TABLE "IrlGatheringPushCandidate" ALTER COLUMN "eventEndDate" SET NOT NULL;

-- Index to support window queries by end date
CREATE INDEX IF NOT EXISTS "IrlGatheringPushCandidate_eventEndDate_idx" ON "IrlGatheringPushCandidate"("eventEndDate");
