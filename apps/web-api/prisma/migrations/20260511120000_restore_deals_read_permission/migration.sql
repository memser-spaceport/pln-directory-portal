BEGIN;

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
VALUES ('deals.read', 'deals.read', 'Deals', 'View and access Partner Deals', NOW(), NOW())
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
JOIN "Permission" perm ON perm."code" = 'deals.read'
WHERE p."code" IN (
  'directory_admin_pl_internal',
  'pl_infra_team_pl_internal',
  'founder_plc_plvs',
  'founder_plc_crypto',
  'founder_plc_founder_forge'
)
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
