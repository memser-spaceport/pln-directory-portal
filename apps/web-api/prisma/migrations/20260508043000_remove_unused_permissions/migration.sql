-- Remove unused permissions from Back Office / RBAC tables.
-- Includes founder.guide.view from the ticket and founder_guides.view legacy code found in existing migrations/seed.

WITH unused_permissions AS (
  SELECT "uid"
  FROM "Permission"
  WHERE "code" IN (
    'deals.view',
    'deals.read',
    'founder.guide.view',
    'founder_guides.view'
  )
)
DELETE FROM "RolePermission"
WHERE "permissionUid" IN (SELECT "uid" FROM unused_permissions);

WITH unused_permissions AS (
  SELECT "uid"
  FROM "Permission"
  WHERE "code" IN (
    'deals.view',
    'deals.read',
    'founder.guide.view',
    'founder_guides.view'
  )
)
DELETE FROM "MemberPermission"
WHERE "permissionUid" IN (SELECT "uid" FROM unused_permissions);

WITH unused_permissions AS (
  SELECT "uid"
  FROM "Permission"
  WHERE "code" IN (
    'deals.view',
    'deals.read',
    'founder.guide.view',
    'founder_guides.view'
  )
)
DELETE FROM "MemberPermissionV2"
WHERE "permissionUid" IN (SELECT "uid" FROM unused_permissions);

WITH unused_permissions AS (
  SELECT "uid"
  FROM "Permission"
  WHERE "code" IN (
    'deals.view',
    'deals.read',
    'founder.guide.view',
    'founder_guides.view'
  )
)
DELETE FROM "PolicyPermission"
WHERE "permissionUid" IN (SELECT "uid" FROM unused_permissions);

DELETE FROM "Permission"
WHERE "code" IN (
  'deals.view',
  'deals.read',
  'founder.guide.view',
  'founder_guides.view'
);
