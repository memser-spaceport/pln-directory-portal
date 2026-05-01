BEGIN;

-- =========================================================
-- Add member.onboarding permission and link to Founder/PLN Close Contributor policy
-- =========================================================

-- 1. Insert the member.onboarding permission (idempotent)
INSERT INTO "Permission" ("uid", "code", "description", "createdAt", "updatedAt")
SELECT 'perm_member_onboarding', 'member.onboarding', 'Access to onboarding flow (replaces L4-based onboarding)', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'member.onboarding');

-- 2. Link member.onboarding to founder_pln_close_contributor policy (idempotent)
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_founder_pln_close_contributor_onboarding',
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'member.onboarding'
WHERE p."code" = 'founder_pln_close_contributor'
  AND NOT EXISTS (
    SELECT 1 FROM "PolicyPermission" pp
    WHERE pp."policyUid" = p."uid"
    AND pp."permissionUid" = perm."uid"
  );

COMMIT;
