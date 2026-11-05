-- Grant mcp.connect to the policies held by approved members.
-- Job Aspirants stay on job_aspirant, which does not get this permission.
-- Directory Admin and PL Infra already have it.

BEGIN;

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('founder_plc_plvs', 'mcp.connect'),
    ('founder_plc_crypto', 'mcp.connect'),
    ('founder_plc_founder_forge', 'mcp.connect'),
    ('founder_plc_neuro', 'mcp.connect'),
    ('founder_pln_close_contributor', 'mcp.connect'),
    ('founder_plc_other', 'mcp.connect'),
    ('founder_pln_other', 'mcp.connect'),
    ('investor_pl', 'mcp.connect'),
    ('investor_pl_crecimiento_founder_school', 'mcp.connect'),
    ('unassigned_plc_plvs', 'mcp.connect'),
    ('unassigned_plc_crypto', 'mcp.connect'),
    ('unassigned_plc_founder_forge', 'mcp.connect'),
    ('unassigned_plc_neuro', 'mcp.connect'),
    ('unassigned_pln_close_contributor', 'mcp.connect'),
    ('unassigned_pln_other', 'mcp.connect'),
    ('unassigned_plc_other', 'mcp.connect')
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
