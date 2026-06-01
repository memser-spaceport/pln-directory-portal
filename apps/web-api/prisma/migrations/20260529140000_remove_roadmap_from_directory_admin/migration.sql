-- Remove all roadmap (Gantry) permissions from the directory admin policy.
-- These were granted in 20260528120000_add_roadmap_rbac; roadmap access is now
-- managed via the dedicated roadmap permissions / roadmap.admin aggregate instead.
-- Idempotent — safe to re-run.

BEGIN;

DELETE FROM "PolicyPermission" pp
USING "Policy" p, "Permission" perm
WHERE pp."policyUid" = p."uid"
  AND pp."permissionUid" = perm."uid"
  AND p."code" = 'directory_admin_pl_internal'
  AND perm."code" LIKE 'roadmap.%';

COMMIT;
