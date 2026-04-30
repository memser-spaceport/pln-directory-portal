BEGIN;

-- Add hidden column to Policy table
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

-- Hide the advisor_future policy
UPDATE "Policy" SET "hidden" = true WHERE "code" = 'advisor_future';

-- Add directory.admin.full permission to pl_infra_team_pl_internal policy
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'directory.admin.full'
WHERE p."code" = 'pl_infra_team_pl_internal'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
