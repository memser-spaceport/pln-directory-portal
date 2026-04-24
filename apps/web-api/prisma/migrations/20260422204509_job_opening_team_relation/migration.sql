BEGIN;
-- Add teamUid column
ALTER TABLE "JobOpening"
    ADD COLUMN "teamUid" TEXT NULL;
-- Safer data migration: handle non-integer dwCompanyId values
UPDATE "JobOpening" jo
SET "teamUid" = t."uid"
FROM "Team" t
WHERE jo."dwCompanyId" IS NOT NULL
  AND jo."dwCompanyId" ~ '^\d+$'  -- only numeric values
  AND t."id" = CAST(jo."dwCompanyId" AS INTEGER);
-- Add foreign key
ALTER TABLE "JobOpening"
    ADD CONSTRAINT "JobOpening_teamUid_fkey"
        FOREIGN KEY ("teamUid")
            REFERENCES "Team"("uid")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
-- Create indexes
CREATE INDEX "JobOpening_teamUid_idx" ON "JobOpening" ("teamUid");
CREATE INDEX "TeamFocusArea_teamUid_idx" ON "TeamFocusArea"("teamUid");
CREATE INDEX "JobOpening_location_idx" ON "JobOpening"("location");
CREATE INDEX "JobOpening_updatedAt_idx" ON "JobOpening"("updatedAt");
CREATE INDEX "JobOpening_teamUid_updatedAt_nonstale_idx"
    ON "JobOpening"("teamUid", "updatedAt" DESC)
    WHERE "status" <> 'STALE'::"JobOpeningStatus" AND "teamUid" IS NOT NULL;
-- Drop old column
ALTER TABLE "JobOpening"
    DROP COLUMN "dwCompanyId";
COMMIT;