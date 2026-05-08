BEGIN;

-- Ensure IRL Gathering permissions exist in environments where AC v2 data is incomplete.
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
VALUES
  ('irlg.going.read', 'irlg.going.read', 'IRL Gatherings', 'Read IRL Gathering data', NOW(), NOW()),
  ('irlg.going.write', 'irlg.going.write', 'IRL Gatherings', 'Manage IRL Gathering data', NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "updatedAt" = NOW();

-- Grant IRL Gathering permissions to PL Infra Team / PL Internal policy.
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" IN ('irlg.going.read', 'irlg.going.write')
WHERE p."code" = 'pl_infra_team_pl_internal'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
