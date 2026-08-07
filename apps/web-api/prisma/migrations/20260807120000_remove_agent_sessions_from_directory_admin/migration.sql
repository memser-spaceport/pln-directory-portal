-- Remove Agent Sessions permissions from the directory admin policy.
-- These were granted in 20260804120000_add_code_agent_sessions_permissions;
-- access is now direct-permission only (same pattern as roadmap/Gantry).
-- Idempotent — safe to re-run.

BEGIN;

DELETE FROM "PolicyPermission" pp
USING "Policy" p, "Permission" perm
WHERE pp."policyUid" = p."uid"
  AND pp."permissionUid" = perm."uid"
  AND p."code" = 'directory_admin_pl_internal'
  AND perm."code" LIKE 'code_agent_sessions.%';

COMMIT;
