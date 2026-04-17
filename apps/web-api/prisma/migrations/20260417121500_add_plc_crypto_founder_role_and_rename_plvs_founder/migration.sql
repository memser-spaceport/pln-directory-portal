-- Create PLC Crypto Founder role
INSERT INTO "Role" ("uid", "code", "name", "description", "createdAt", "updatedAt")
VALUES ('role_plc_crypto_founder',
        'PLC_CRYPTO_FOUNDER',
        'PLC Crypto Founder',
        'Can view Founder Guides only',
        now(),
        now())
ON CONFLICT ("code") DO NOTHING;

-- Grant founder_guides.view to PLC Crypto Founder with PLCC scope
INSERT INTO "RolePermission" ("roleUid", "permissionUid", "scopes", "createdAt")
SELECT 'role_plc_crypto_founder', "uid", ARRAY['PLCC']::TEXT[], now()
FROM "Permission"
WHERE "code" = 'founder_guides.view'
ON CONFLICT ("roleUid", "permissionUid") DO NOTHING;

-- Rename role display name only; keep uid/code unchanged
UPDATE "Role"
SET "name" = 'PLC PLVS Founder',
    "updatedAt" = now()
WHERE "code" = 'PL_VS_FOUNDER';
