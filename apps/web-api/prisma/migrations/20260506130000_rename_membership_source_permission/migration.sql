BEGIN;

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
VALUES (
  'team.membership_source.read',
  'team.membership_source.read',
  'Directory',
  'Read the Membership Source section on team pages',
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "description" = EXCLUDED."description",
    "updatedAt" = NOW();

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  CONCAT('pp_', md5(pol."uid" || ':team_membership_source_read')),
  pol."uid",
  new_perm."uid",
  NOW()
FROM "Policy" pol
JOIN "PolicyPermission" pp ON pp."policyUid" = pol."uid"
JOIN "Permission" old_perm ON old_perm."uid" = pp."permissionUid" AND old_perm."code" = 'membership.source.read'
JOIN "Permission" new_perm ON new_perm."code" = 'team.membership_source.read'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

INSERT INTO "MemberPermissionV2" ("uid", "memberUid", "permissionUid", "createdAt", "updatedAt")
SELECT
  CONCAT('mp_', md5(mp."memberUid" || ':team_membership_source_read')),
  mp."memberUid",
  new_perm."uid",
  NOW(),
  NOW()
FROM "MemberPermissionV2" mp
JOIN "Permission" old_perm ON old_perm."uid" = mp."permissionUid" AND old_perm."code" = 'membership.source.read'
JOIN "Permission" new_perm ON new_perm."code" = 'team.membership_source.read'
ON CONFLICT ("memberUid", "permissionUid") DO NOTHING;

COMMIT;
