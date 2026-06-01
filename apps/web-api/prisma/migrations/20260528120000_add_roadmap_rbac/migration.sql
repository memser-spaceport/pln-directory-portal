-- Roadmap (Gantry) RBAC: permissions and policy grants.
-- Product Team curate/transition: assign roadmap.item.curate and roadmap.item.transition
-- via direct member permissions (MemberPermissionV2), not a dedicated policy.
-- Idempotent — safe to re-run.

BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    ('roadmap.view', 'roadmap.view', 'Roadmap', 'View the Roadmap module (Ideas + Roadmap views)'),
    ('roadmap.idea.create', 'roadmap.idea.create', 'Roadmap', 'Submit a new idea'),
    ('roadmap.item.upvote', 'roadmap.item.upvote', 'Roadmap', 'Toggle upvote on any roadmap item'),
    ('roadmap.item.edit_own', 'roadmap.item.edit_own', 'Roadmap', 'Edit or archive own item while in IDEA or UNDER_REVIEW'),
    ('roadmap.item.curate', 'roadmap.item.curate', 'Roadmap', 'Edit any item at any stage; create roadmap items directly; archive any'),
    ('roadmap.item.transition', 'roadmap.item.transition', 'Roadmap', 'Promote, decline, and move kanban columns')
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('pl_infra_team_pl_internal', 'roadmap.view'),
    ('pl_infra_team_pl_internal', 'roadmap.idea.create'),
    ('pl_infra_team_pl_internal', 'roadmap.item.upvote'),
    ('pl_infra_team_pl_internal', 'roadmap.item.edit_own'),
    ('directory_admin_pl_internal', 'roadmap.view'),
    ('directory_admin_pl_internal', 'roadmap.idea.create'),
    ('directory_admin_pl_internal', 'roadmap.item.upvote'),
    ('directory_admin_pl_internal', 'roadmap.item.edit_own'),
    ('directory_admin_pl_internal', 'roadmap.item.curate'),
    ('directory_admin_pl_internal', 'roadmap.item.transition')
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
