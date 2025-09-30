-- Enums
CREATE TYPE "UploadStorage" AS ENUM ('IPFS','S3');
CREATE TYPE "UploadKind" AS ENUM ('IMAGE','SLIDE','VIDEO','OTHER');
CREATE TYPE "UploadScopeType" AS ENUM ('NONE','TEAM','MEMBER','PROJECT');
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADED','PROCESSING','READY','FAILED');

-- Table
CREATE TABLE "Upload"
(
  "id"          SERIAL PRIMARY KEY,
  "uid"         TEXT              NOT NULL UNIQUE,
  "storage"     "UploadStorage"   NOT NULL,
  "kind"        "UploadKind"      NOT NULL,
  "status"      "UploadStatus"    NOT NULL DEFAULT 'READY',

  "scopeType"   "UploadScopeType" NOT NULL DEFAULT 'NONE',
  "scopeUid"    TEXT,

  "uploaderUid" TEXT,
  "bucket"      TEXT,
  "key"         TEXT,
  "cid"         TEXT,

  "url"         TEXT              NOT NULL,
  "filename"    TEXT              NOT NULL,
  "mimetype"    TEXT              NOT NULL,
  "size"        INTEGER           NOT NULL,
  "checksum"    TEXT,
  "meta"        JSONB,

  "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs and indexes
ALTER TABLE "Upload"
  ADD CONSTRAINT "Upload_uploaderUid_fkey"
    FOREIGN KEY ("uploaderUid") REFERENCES "Member" ("uid") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Upload_scopeType_scopeUid_idx" ON "Upload" ("scopeType", "scopeUid");
CREATE INDEX "Upload_kind_idx" ON "Upload" ("kind");
CREATE INDEX "Upload_uploaderUid_idx" ON "Upload" ("uploaderUid");

-- AlterTable
ALTER TABLE "Upload" ALTER COLUMN "updatedAt" DROP DEFAULT;

