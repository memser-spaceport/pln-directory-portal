-- Add deals.view permission for DIRECTORY_ADMIN role
-- This permission grants access to deals features alongside the existing whitelist system

-- Step 1: Create the deals.view permission
INSERT INTO "Permission" ("uid", "code", "description", "createdAt", "updatedAt")
VALUES ('perm_deals_view',
        'deals.view',
        'Can view and access deals',
        now(),
        now())
ON CONFLICT ("code") DO NOTHING;

-- Step 2: Grant deals.view permission to DIRECTORY_ADMIN role
INSERT INTO "RolePermission" ("roleUid", "permissionUid", "scopes", "createdAt")
VALUES ('role_directory_admin', 'perm_deals_view', ARRAY[]::TEXT[], now())
ON CONFLICT ("roleUid", "permissionUid") DO NOTHING;
