-- CreateTable
CREATE TABLE IF NOT EXISTS "DemoDayEngagement"
(
  "id" SERIAL NOT NULL PRIMARY KEY,
  "uid"             TEXT         NOT NULL,
  "demoDayUid"      TEXT         NOT NULL,
  "memberUid"       TEXT         NOT NULL,
  "calendarAddedAt" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DemoDayEngagement_demoDayUid_fkey"
    FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay" ("uid") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "DemoDayEngagement_memberUid_fkey"
    FOREIGN KEY ("memberUid") REFERENCES "Member" ("uid") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "DemoDayEngagement_demoDayUid_memberUid_key"
    UNIQUE ("demoDayUid", "memberUid"),

  CONSTRAINT "DemoDayEngagement_uid_key"
      UNIQUE ("uid")
);
