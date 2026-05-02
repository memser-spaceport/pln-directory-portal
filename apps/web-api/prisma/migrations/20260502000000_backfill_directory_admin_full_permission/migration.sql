-- Backfill directory.admin.full to legacy DIRECTORYADMIN members.
-- Adjust table/column names if your Prisma schema uses different names.
INSERT INTO "MemberPermissionV2" ("uid", "memberUid", "permissionUid", "createdAt", "updatedAt")
SELECT
  'mpv2_' || md5(m."uid" || ':' || p."uid"),
  m."uid",
  p."uid",
  NOW(),
  NOW()
FROM "Member" m
JOIN "_MemberToMemberRole" mmr ON mmr."A" = m."id"
JOIN "MemberRole" mr ON mr."id" = mmr."B"
JOIN "Permission" p ON p."code" = 'directory.admin.full'
WHERE mr."name" IN ('DIRECTORYADMIN', 'DIRECTORY_ADMIN')
ON CONFLICT ("memberUid", "permissionUid") DO NOTHING;
