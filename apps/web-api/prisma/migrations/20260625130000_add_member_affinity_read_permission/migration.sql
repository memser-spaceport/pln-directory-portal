-- Affinity member profile read (Members page PL Infra section).
BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    (
      'member.affinity.read',
      'member.affinity.read',
      'Members',
      'View Affinity CRM context for a member (founder profile + linked companies)'
    )
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('pl_infra_team_pl_internal', 'member.affinity.read'),
    ('directory_admin_pl_internal', 'member.affinity.read')
)
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM mappings m
       JOIN "Policy" p ON p."code" = m.policy_code
       JOIN "Permission" perm ON perm."code" = m.permission_code
WHERE NOT EXISTS (
  SELECT 1
  FROM "PolicyPermission" pp
  WHERE pp."policyUid" = p."uid"
    AND pp."permissionUid" = perm."uid"
);

COMMIT;
