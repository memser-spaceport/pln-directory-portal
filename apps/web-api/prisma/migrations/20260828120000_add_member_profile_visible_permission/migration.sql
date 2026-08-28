-- Directory visibility without approval (Job Aspirant / Job Board).
-- Subject-side: the member who holds this permission appears in list/search
-- and on the public profile even while MemberApproval is PENDING.
-- Idempotent: safe if the permission or policy grant already exists.

BEGIN;

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT
  'member.profile.visible',
  'member.profile.visible',
  'Directory',
  'Appear in the directory and public profile without being APPROVED',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "Permission"
  WHERE "code" = 'member.profile.visible'
);

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'member.profile.visible'
WHERE p."code" = 'job_aspirant'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

UPDATE "Policy"
SET
  "description" = 'Members who signed up through the Job Board. Directory-visible without requiring approval.',
  "updatedAt" = NOW()
WHERE "code" = 'job_aspirant';

COMMIT;
