-- Entry permission for the PL ATS (LAB-2576). Granted directly per member from the
-- back office; no policy holds it, so there is no PolicyPermission row here.

BEGIN;

INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
SELECT 'ats_user', 'ats_user', 'Open the PL ATS', 'ATS', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'ats_user');

COMMIT;
