BEGIN;

-- Add teamUid column to JobOpening
ALTER TABLE "JobOpening"
    ADD COLUMN "teamUid" TEXT NULL;

-- Migrate data: dwCompanyId maps to Team.id (integer), we need to get Team.uid
UPDATE "JobOpening" jo
SET "teamUid" = t."uid"
FROM "Team" t
WHERE jo."dwCompanyId" IS NOT NULL
  AND t."id" = CAST(jo."dwCompanyId" AS INTEGER);

-- Add foreign key constraint
ALTER TABLE "JobOpening"
    ADD CONSTRAINT "JobOpening_teamUid_fkey"
        FOREIGN KEY ("teamUid")
            REFERENCES "Team"("uid")
            ON DELETE SET NULL
            ON UPDATE CASCADE;

-- Add index on teamUid
CREATE INDEX "JobOpening_teamUid_idx"
    ON "JobOpening" ("teamUid");

-- Drop the old dwCompanyId column
ALTER TABLE "JobOpening"
    DROP COLUMN "dwCompanyId";

CREATE INDEX "TeamFocusArea_teamUid_idx" ON "TeamFocusArea"("teamUid");

CREATE INDEX "JobOpening_location_idx" ON "JobOpening"("location");

CREATE INDEX "JobOpening_updatedAt_idx" ON "JobOpening"("updatedAt");

CREATE INDEX "JobOpening_teamUid_updatedAt_nonstale_idx"
ON "JobOpening"("teamUid", "updatedAt" DESC)
WHERE "status" <> 'STALE'::"JobOpeningStatus" AND "teamUid" IS NOT NULL;

COMMIT;
