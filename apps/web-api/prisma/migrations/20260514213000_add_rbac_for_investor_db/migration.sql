-- Add RBAC permissions for the LabOS Investor DB module.
--
-- Two flat permissions (the 3 frontend tabs are lenses over the same dataset,
-- so per-tab splits don't map to anything meaningful in the backend):
--   investor_db.view  — read access to the page (required to see the module at all)
--   investor_db.edit  — mutate (tag, save view, CSV export, bulk actions)
--
-- Granted to:
--   directory_admin_pl_internal   — admins always have full access
--   pl_investment_team_pl_internal — new dedicated policy for the PL investment team
--
-- All steps idempotent: re-runs are safe (NOT EXISTS guards on Permission +
-- PolicyPermission; ON CONFLICT DO NOTHING on Policy).

BEGIN;

-- =========================================================
-- 1. Insert permissions
--    `module` is the feature-area grouping displayed in the back-office RBAC UI.
-- =========================================================
WITH seed(uid, code, module, description) AS (
  VALUES
    ('investor_db.view', 'investor_db.view', 'Investor DB', 'View the LabOS Investor DB module (page + table + drawer)'),
    ('investor_db.edit', 'investor_db.edit', 'Investor DB', 'Mutate Investor DB: tag, save view, CSV export, bulk actions')
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

-- =========================================================
-- 2. Create dedicated policy for PL investment team
-- =========================================================
INSERT INTO "Policy" ("uid", "code", "name", "description", "role", "group", "isSystem", "hidden", "createdAt", "updatedAt")
VALUES (
  'policy_pl_investment_team_pl_internal',
  'pl_investment_team_pl_internal',
  'PL Investment Team / PL Internal',
  'PL capital / investment team — access to the internal Investor DB module',
  'PL Investment Team',
  'PL Internal',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;

-- =========================================================
-- 3. Link permissions to policies
-- =========================================================
WITH mappings(policy_code, permission_code) AS (
  VALUES
    -- Admins get full access
    ('directory_admin_pl_internal', 'investor_db.view'),
    ('directory_admin_pl_internal', 'investor_db.edit'),
    -- Dedicated investment-team policy gets full access
    ('pl_investment_team_pl_internal', 'investor_db.view'),
    ('pl_investment_team_pl_internal', 'investor_db.edit')
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
