-- Add DEMO_DAY_ADMIN role to MemberRole table if it doesn't exist
INSERT INTO "MemberRole" (uid, name, "createdAt", "updatedAt")
SELECT 'uid-demo-day-admin', 'DEMO_DAY_ADMIN', NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "MemberRole" WHERE name = 'DEMO_DAY_ADMIN'
);
