-- ATS entry policy (LAB-2576). Holds the existing ats_user permission.
-- Grant this policy in Back Office instead of assigning ats_user directly.
-- Idempotent: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO "Policy" ("uid", "code", "name", "description", "role", "group", "isSystem", "hidden", "createdAt", "updatedAt")
VALUES (
  'policy_pl_ats_user',
  'pl_ats_user',
  'PL ATS User',
  'Entry gate for the PL ATS. Assign this policy to grant ats_user.',
  'ATS User',
  'ATS',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_pl_ats_user_ats_user',
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'ats_user'
WHERE p."code" = 'pl_ats_user'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
