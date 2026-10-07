-- Grant mcp.connect to the PL Infra Team / PL Internal policy.
-- The permission already exists (Directory Admin). This only adds the mapping.

BEGIN;

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('pl_infra_team_pl_internal', 'mcp.connect')
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
