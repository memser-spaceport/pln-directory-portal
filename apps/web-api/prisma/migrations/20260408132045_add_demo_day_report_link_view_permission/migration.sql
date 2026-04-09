-- Add permission to view Demo Day report link
INSERT INTO "Permission" ("uid", "code", "description", "createdAt", "updatedAt")
VALUES (
         'perm_demo_day_report_link_view',
         'demo_day.report_link.view',
         'Can view Demo Day report link',
         now(),
         now()
       )
  ON CONFLICT ("code") DO NOTHING;

-- Grant direct permission to all current legacy DEMO_DAY_ADMIN and DIRECTORY_ADMIN members
INSERT INTO "MemberPermission" (
  "uid",
  "memberUid",
  "permissionUid",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  m."uid",
  'perm_demo_day_report_link_view',
  'ACTIVE',
  now(),
  now()
FROM "Member" m
       JOIN "_MemberToMemberRole" mmr ON mmr."A" = m."id"
       JOIN "MemberRole" mr ON mr."id" = mmr."B"
WHERE mr."name" IN ('DEMO_DAY_ADMIN', 'DIRECTORY_ADMIN')
  AND NOT EXISTS (
  SELECT 1
  FROM "MemberPermission" mp
  WHERE mp."memberUid" = m."uid"
    AND mp."permissionUid" = 'perm_demo_day_report_link_view'
    AND mp."status" = 'ACTIVE'
    AND mp."revokedAt" IS NULL
);
