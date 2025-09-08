-- TeamFundraisingProfile: status enum
DO
$$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamFundraisingProfileStatus') THEN
      CREATE TYPE "TeamFundraisingProfileStatus" AS ENUM ('DISABLED', 'DRAFT', 'PUBLISHED');
    END IF;
  END
$$;

-- TeamFundraisingProfile table
CREATE TABLE IF NOT EXISTS "TeamFundraisingProfile"
(
  "id"              SERIAL PRIMARY KEY,
  "uid"             TEXT                           NOT NULL,
  "teamUid"         TEXT                           NOT NULL,
  "focusAreaUid"    TEXT,
  "fundingStageUid" TEXT,
  "onePagerUrl"     TEXT,
  "videoUrl"        TEXT,
  "status"          "TeamFundraisingProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"       TIMESTAMP(3)                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastModifiedBy"  TEXT,

  CONSTRAINT "TeamFundraisingProfile_uid_key" UNIQUE ("uid"),
  CONSTRAINT "TeamFundraisingProfile_teamUid_key" UNIQUE ("teamUid"),

  CONSTRAINT "TeamFundraisingProfile_teamUid_fkey"
    FOREIGN KEY ("teamUid") REFERENCES "Team" ("uid") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "TeamFundraisingProfile_focusAreaUid_fkey"
    FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea" ("uid") ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "TeamFundraisingProfile_fundingStageUid_fkey"
    FOREIGN KEY ("fundingStageUid") REFERENCES "FundingStage" ("uid") ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "TeamFundraisingProfile_lastModifiedBy_fkey"
    FOREIGN KEY ("lastModifiedBy") REFERENCES "Member" ("uid") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS "TeamFundraisingProfile_status_idx"
  ON "TeamFundraisingProfile" ("status");

-- Optional: speed up team lookups (unique already exists)
CREATE INDEX IF NOT EXISTS "TeamFundraisingProfile_teamUid_idx"
  ON "TeamFundraisingProfile" ("teamUid");
