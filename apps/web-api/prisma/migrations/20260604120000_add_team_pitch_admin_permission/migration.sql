BEGIN;

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
VALUES (
  'team_pitch.admin',
  'team_pitch.admin',
  'Team Pitch',
  'Admin access to Team Pitch pages',
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'team_pitch.admin'
WHERE p."code" = 'directory_admin_pl_internal'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
