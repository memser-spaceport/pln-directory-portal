-- access-control-v2 bootstrap migration
-- Note: this migration intentionally keeps legacy RBAC tables intact.

CREATE TABLE "Policy" (
  "uid" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "role" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Policy_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "Policy_code_key" ON "Policy"("code");

CREATE TABLE "PolicyPermission" (
  "uid" TEXT NOT NULL,
  "policyUid" TEXT NOT NULL,
  "permissionUid" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PolicyPermission_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "PolicyPermission_policyUid_permissionUid_key" ON "PolicyPermission"("policyUid", "permissionUid");
CREATE INDEX "PolicyPermission_policyUid_idx" ON "PolicyPermission"("policyUid");
CREATE INDEX "PolicyPermission_permissionUid_idx" ON "PolicyPermission"("permissionUid");

CREATE TABLE "PolicyAssignment" (
  "uid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "policyUid" TEXT NOT NULL,
  "assignedByUid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PolicyAssignment_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "PolicyAssignment_memberUid_policyUid_key" ON "PolicyAssignment"("memberUid", "policyUid");
CREATE INDEX "PolicyAssignment_memberUid_idx" ON "PolicyAssignment"("memberUid");
CREATE INDEX "PolicyAssignment_policyUid_idx" ON "PolicyAssignment"("policyUid");

CREATE TABLE "MemberPermissionV2" (
  "uid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "permissionUid" TEXT NOT NULL,
  "grantedByUid" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberPermissionV2_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "MemberPermissionV2_memberUid_permissionUid_key" ON "MemberPermissionV2"("memberUid", "permissionUid");
CREATE INDEX "MemberPermissionV2_memberUid_idx" ON "MemberPermissionV2"("memberUid");
CREATE INDEX "MemberPermissionV2_permissionUid_idx" ON "MemberPermissionV2"("permissionUid");

ALTER TABLE "PolicyPermission"
  ADD CONSTRAINT "PolicyPermission_policyUid_fkey"
  FOREIGN KEY ("policyUid") REFERENCES "Policy"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyPermission"
  ADD CONSTRAINT "PolicyPermission_permissionUid_fkey"
  FOREIGN KEY ("permissionUid") REFERENCES "Permission"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyAssignment"
  ADD CONSTRAINT "PolicyAssignment_policyUid_fkey"
  FOREIGN KEY ("policyUid") REFERENCES "Policy"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyAssignment"
  ADD CONSTRAINT "PolicyAssignment_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyAssignment"
  ADD CONSTRAINT "PolicyAssignment_assignedByUid_fkey"
  FOREIGN KEY ("assignedByUid") REFERENCES "Member"("uid")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemberPermissionV2"
  ADD CONSTRAINT "MemberPermissionV2_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPermissionV2"
  ADD CONSTRAINT "MemberPermissionV2_permissionUid_fkey"
  FOREIGN KEY ("permissionUid") REFERENCES "Permission"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPermissionV2"
  ADD CONSTRAINT "MemberPermissionV2_grantedByUid_fkey"
  FOREIGN KEY ("grantedByUid") REFERENCES "Member"("uid")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "requiredPermissionCode" TEXT;
