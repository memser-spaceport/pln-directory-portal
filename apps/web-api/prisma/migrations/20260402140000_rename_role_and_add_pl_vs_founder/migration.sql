-- Rename FOUNDER_GUIDES_EDITOR role to DIRECTORY_ADMIN
-- and create PL_VS_FOUNDER role with view-only access

-- Step 1: Update existing role UID and details (cascade will update RolePermission)
UPDATE "Role"
SET "uid" = 'role_directory_admin',
    "code" = 'DIRECTORY_ADMIN',
    "name" = 'Directory Admin',
    "description" = 'Can view and create Founder Guides articles',
    "updatedAt" = now()
WHERE "code" = 'FOUNDER_GUIDES_EDITOR';

-- Step 2: Update RoleAssignment roleUid references (not handled by cascade)
UPDATE "RoleAssignment"
SET "roleUid" = 'role_directory_admin'
WHERE "roleUid" = 'role_founder_guides_editor';

-- Step 3: Create new PL_VS_FOUNDER role with view-only access
INSERT INTO "Role" ("uid", "code", "name", "description", "createdAt", "updatedAt")
VALUES ('role_pl_vs_founder',
        'PL_VS_FOUNDER',
        'PL VS Founder',
        'Can view Founder Guides only',
        now(),
        now())
ON CONFLICT ("code") DO NOTHING;

-- Step 4: Grant view permission to PL_VS_FOUNDER role
INSERT INTO "RolePermission" ("roleUid", "permissionUid", "createdAt")
SELECT 'role_pl_vs_founder', "uid", now()
FROM "Permission"
WHERE "code" = 'founder_guides.view'
ON CONFLICT DO NOTHING;
