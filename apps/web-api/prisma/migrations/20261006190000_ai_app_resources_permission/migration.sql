-- Separate permission for the Back Office AI App resources screen/API.
-- Deliberately not attached to any existing role/policy. Grant it to named admins after prod release.
INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
SELECT
  'ai_apps.resources.manage',
  'ai_apps.resources.manage',
  'Manage per-app CPU and memory resource overrides',
  'AI Apps',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "code" = 'ai_apps.resources.manage'
);
