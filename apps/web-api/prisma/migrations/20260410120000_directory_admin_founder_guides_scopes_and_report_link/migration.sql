-- Directory Admin: PLCC + PLVS scopes on founder guide permissions
UPDATE "RolePermission"
SET "scopes" = ARRAY['PLCC', 'PLVS']::TEXT[]
WHERE "roleUid" = 'role_directory_admin'
  AND "permissionUid" IN ('perm_founder_guides_view', 'perm_founder_guides.create');

-- PL VS Founder: PLVS scope on founder guides view
UPDATE "RolePermission"
SET "scopes" = ARRAY['PLVS']::TEXT[]
WHERE "roleUid" = 'role_pl_vs_founder'
  AND "permissionUid" = 'perm_founder_guides_view';

-- Directory Admin: demo_day.report_link.view (no scopes)
INSERT INTO "RolePermission" ("roleUid", "permissionUid", "scopes", "createdAt")
VALUES ('role_directory_admin', 'perm_demo_day_report_link_view', ARRAY[]::TEXT[], now())
ON CONFLICT ("roleUid", "permissionUid") DO NOTHING;
