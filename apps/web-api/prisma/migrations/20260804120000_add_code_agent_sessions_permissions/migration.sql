-- Agent Sessions (code-fix-orchestrator POC) permissions for Directory Admin.
BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    (
      'code_agent_sessions.view',
      'code_agent_sessions.view',
      'Agent Sessions',
      'View Agent Sessions list, detail, status, PR and feature-env URLs'
    ),
    (
      'code_agent_sessions.admin',
      'code_agent_sessions.admin',
      'Agent Sessions',
      'Create Agent Sessions'
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
    ('directory_admin_pl_internal', 'code_agent_sessions.view'),
    ('directory_admin_pl_internal', 'code_agent_sessions.admin')
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
