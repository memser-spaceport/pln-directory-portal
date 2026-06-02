-- Add RBAC permissions for the LabOS Founder DB (signal-sourcing review surface).
--
--   founder_db.view  — read founders list, detail, KPI summary
--   founder_db.edit  — review actions (approve / reject / hold / wrong-fund)
--
-- Granted to the same policies as investor_db (directory admins + PL investment team).

BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    ('founder_db.view', 'founder_db.view', 'Founder DB', 'View the LabOS Founder DB module (list, detail, KPIs)'),
    ('founder_db.edit', 'founder_db.edit', 'Founder DB', 'Review founders: approve, reject, hold, feedback')
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('directory_admin_pl_internal', 'founder_db.view'),
    ('directory_admin_pl_internal', 'founder_db.edit'),
    ('pl_investment_team_pl_internal', 'founder_db.view'),
    ('pl_investment_team_pl_internal', 'founder_db.edit')
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
