BEGIN;

-- 1. Backfill requiredPermissionCode from legacy scope
UPDATE "Article"
SET "requiredPermissionCode" = CASE
                                 WHEN "scope" = 'PLVS' THEN 'founder_guides.view.plvs'
                                 WHEN "scope" = 'PLCC' THEN 'founder_guides.view.plcc'
                                 ELSE "requiredPermissionCode"
  END
WHERE "requiredPermissionCode" IS NULL
  AND "scope" IS NOT NULL;

COMMIT;
