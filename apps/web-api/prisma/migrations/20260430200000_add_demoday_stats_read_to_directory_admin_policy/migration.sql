BEGIN;

UPDATE "Permission"
SET
  "code" = 'demoday.report_link.read',
  "updatedAt" = NOW()
WHERE "code" = 'demo_day.report_link.view';

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_directory_admin_pl_internal_demoday_stats_read',
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'demoday.stats.read'
WHERE p."code" = 'directory_admin_pl_internal'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyPermission" pp
    WHERE pp."policyUid" = p."uid"
      AND pp."permissionUid" = perm."uid"
  );

COMMIT;
