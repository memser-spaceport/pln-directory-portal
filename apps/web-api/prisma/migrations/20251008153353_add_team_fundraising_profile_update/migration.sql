-- Drop old columns
ALTER TABLE "TeamFundraisingProfile"
DROP COLUMN IF EXISTS "onePagerUrl",
  DROP COLUMN IF EXISTS "videoUrl";

-- Add new Upload reference columns
ALTER TABLE "TeamFundraisingProfile"
  ADD COLUMN "onePagerUploadUid" TEXT,
  ADD COLUMN "videoUploadUid"    TEXT;

-- Add foreign keys
ALTER TABLE "TeamFundraisingProfile"
  ADD CONSTRAINT "TeamFundraisingProfile_onePagerUploadUid_fkey"
    FOREIGN KEY ("onePagerUploadUid") REFERENCES "Upload" ("uid")
      ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TeamFundraisingProfile_videoUploadUid_fkey"
    FOREIGN KEY ("videoUploadUid") REFERENCES "Upload" ("uid")
    ON DELETE SET NULL ON UPDATE CASCADE;
