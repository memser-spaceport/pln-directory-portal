BEGIN;

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'team_pitch.admin'
WHERE p."code" IN (
  'demo_day_admin_pl_internal',
  'demo_day_admin_pl_crecimiento_founder_school'
)
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
