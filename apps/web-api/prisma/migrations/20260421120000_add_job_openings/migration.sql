-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM (
  'NEW',
  'CONFIRMED',
  'ROUTED_TO_WS4',
  'STALE',
  'CLOSED_DUPLICATE',
  'CLOSED_INCORRECT_SIGNAL',
  'CLOSED_NOT_HIRING_SIGNAL',
  'CLOSED_ROLE_FILLED'
);

-- CreateTable
CREATE TABLE "JobOpening"
(
  "id"              SERIAL            NOT NULL,
  "uid"             TEXT              NOT NULL,
  "status"          "JobOpeningStatus" NOT NULL DEFAULT 'NEW',
  "companyName"     TEXT              NOT NULL,
  "signalType"      TEXT              NOT NULL,
  "roleTitle"       TEXT              NOT NULL,
  "roleCategory"    TEXT,
  "department"      TEXT,
  "seniority"       TEXT,
  "urgency"         TEXT,
  "summary"         TEXT,
  "location"        TEXT,
  "ws4AskId"        TEXT,
  "detectionDate"   TIMESTAMP(3)      NOT NULL,
  "sourceType"      TEXT,
  "sourceLink"      TEXT,
  "detectionMethod" TEXT,
  "companyPriority" TEXT,
  "focusAreas"      TEXT,
  "subFocusAreas"   TEXT,
  "teamNotified"    TEXT,
  "sourceDate"      TIMESTAMP(3),
  "postedDate"      TIMESTAMP(3),
  "lastSeenLive"    TIMESTAMP(3),
  "signalId"        TEXT,
  "canonicalKey"    TEXT              NOT NULL,
  "dwCompanyId"     TEXT,
  "needsReview"     TEXT,
  "notes"           TEXT,
  "portfolio"       TEXT,
  "rawPayload"      JSONB,
  "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)      NOT NULL,

  CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_uid_key"
  ON "JobOpening" ("uid");

CREATE UNIQUE INDEX "JobOpening_canonicalKey_key"
  ON "JobOpening" ("canonicalKey");

CREATE INDEX "JobOpening_status_idx"
  ON "JobOpening" ("status");

CREATE INDEX "JobOpening_companyName_idx"
  ON "JobOpening" ("companyName");

CREATE INDEX "JobOpening_detectionDate_idx"
  ON "JobOpening" ("detectionDate");

CREATE INDEX "JobOpening_lastSeenLive_idx"
  ON "JobOpening" ("lastSeenLive");

CREATE INDEX "JobOpening_sourceType_idx"
  ON "JobOpening" ("sourceType");
