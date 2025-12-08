ALTER TABLE "DemoDay"
  ADD COLUMN "host" TEXT NOT NULL DEFAULT 'plnetwork.io';

CREATE TYPE "DemoDayAdminScopeType" AS ENUM ('HOST');

CREATE TABLE "MemberDemoDayAdminScope"
(
  "id"         SERIAL PRIMARY KEY,
  "memberUid"  TEXT                    NOT NULL,
  "scopeType"  "DemoDayAdminScopeType" NOT NULL,
  "scopeValue" TEXT                    NOT NULL,
  "config"     JSONB,
  CONSTRAINT "MemberDemoDayAdminScope_memberUid_scopeType_scopeValue_key"
    UNIQUE ("memberUid", "scopeType", "scopeValue")
);

-- AddForeignKey
ALTER TABLE "MemberDemoDayAdminScope" ADD CONSTRAINT "MemberDemoDayAdminScope_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

