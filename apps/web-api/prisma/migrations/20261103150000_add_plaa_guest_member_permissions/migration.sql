-- Add PLAA guest and member permissions.
--
-- Managed independently of `plaa.access` through the PLAA integration API.
-- Not attached to any policy; existing `plaa.access` assignments are untouched.
--
-- Idempotent: safe if the permissions already exist.

BEGIN;

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT v.code, v.code, 'PLAA', v.description, NOW(), NOW()
FROM (VALUES
  ('plaa.guest', 'PLAA guest access'),
  ('plaa.member', 'PLAA member access')
) AS v(code, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."code" = v.code);

COMMIT;
