-- Add PLAA access permission.
--
-- PLAA currently has a simple access model:
-- a Directory member with `plaa.access` is considered a PLAA member.
--
-- The permission is intentionally not attached to a policy yet.
-- It can be assigned directly to individual members in Back Office.
--
-- Idempotent: safe if the permission already exists.

BEGIN;

INSERT INTO "Permission" (
  "uid",
  "code",
  "module",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  'plaa.access',
  'plaa.access',
  'PLAA',
  'Access to PLAA',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "Permission"
  WHERE "code" = 'plaa.access'
);

COMMIT;
