-- CreateTable
CREATE TABLE "TeamLogoVerificationResult"
(
  "id"                   SERIAL       NOT NULL,
  "uid"                  TEXT         NOT NULL,
  "teamUid"              TEXT         NOT NULL,
  "logoUid"              TEXT,
  "provider"             TEXT         NOT NULL,
  "model"                TEXT,
  "website"              TEXT,
  "logoUrl"              TEXT,
  "source"               TEXT,
  "verdict"              TEXT         NOT NULL,
  "confidence"           TEXT         NOT NULL,
  "quality"              TEXT         NOT NULL,
  "hasReadableText"      BOOLEAN      NOT NULL DEFAULT false,
  "predictedCompanyName" TEXT,
  "reason"               TEXT,
  "brandSignals"         JSONB,
  "rawResponse"          JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeamLogoVerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamLogoVerificationResult_uid_key"
  ON "TeamLogoVerificationResult" ("uid");

CREATE INDEX "TeamLogoVerificationResult_teamUid_createdAt_idx"
  ON "TeamLogoVerificationResult" ("teamUid", "createdAt");

CREATE INDEX "TeamLogoVerificationResult_teamUid_provider_idx"
  ON "TeamLogoVerificationResult" ("teamUid", "provider");

CREATE INDEX "TeamLogoVerificationResult_logoUid_idx"
  ON "TeamLogoVerificationResult" ("logoUid");

-- AddForeignKey
ALTER TABLE "TeamLogoVerificationResult"
  ADD CONSTRAINT "TeamLogoVerificationResult_teamUid_fkey"
    FOREIGN KEY ("teamUid") REFERENCES "Team" ("uid")
      ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamLogoVerificationResult"
  ADD CONSTRAINT "TeamLogoVerificationResult_logoUid_fkey"
    FOREIGN KEY ("logoUid") REFERENCES "Image" ("uid")
      ON DELETE SET NULL ON UPDATE CASCADE;
