BEGIN;

INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
SELECT
  'member.investor.manage',
  'member.investor.manage',
  'Manage investor capabilities and settings',
  'Directory',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "Permission"
  WHERE "code" = 'member.investor.manage'
);

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'member.investor.manage'
WHERE p."code" IN ('investor_pl', 'investor_pl_partner')
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
