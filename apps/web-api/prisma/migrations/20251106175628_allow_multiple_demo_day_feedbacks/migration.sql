-- DropIndex
-- Remove unique constraint to allow multiple feedback submissions per user per demo day
DROP INDEX "DemoDayFeedback_demoDayUid_memberUid_key";

-- CreateIndex
-- Add composite index for efficient queries while allowing multiple feedback entries
CREATE INDEX "DemoDayFeedback_memberUid_demoDayUid_idx" ON "DemoDayFeedback"("memberUid", "demoDayUid");