-- Remove deals.read from Founder / PLC Other, Founder / PLN Close Contributor, and Founder / PLN Other
-- Remove directory.admin.full from PL Infra Team / PL Internal

BEGIN;

DELETE FROM "PolicyPermission" pp
USING "Policy" p, "Permission" perm
WHERE pp."policyUid" = p."uid"
  AND pp."permissionUid" = perm."uid"
  AND (
    (
      p."code" IN (
        'founder_plc_other',
        'founder_pln_close_contributor',
        'founder_pln_other'
      )
      AND perm."code" = 'deals.read'
    )
    OR (
      p."code" = 'pl_infra_team_pl_internal'
      AND perm."code" = 'directory.admin.full'
    )
  );

COMMIT;
