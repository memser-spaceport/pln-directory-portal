BEGIN;

-- Grant forum.read and forum.write to Unassigned / PLC Other (unassigned_plc_other).
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
CROSS JOIN "Permission" perm
WHERE p."code" = 'unassigned_plc_other'
  AND perm."code" IN ('forum.read', 'forum.write')
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyPermission" pp
    WHERE pp."policyUid" = p."uid"
      AND pp."permissionUid" = perm."uid"
  );

COMMIT;
