BEGIN;

-- Access Control v2: replace MemberRole-based Demo Day admin authorization with permissions/policies.

INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
VALUES
  ('demoday.admin.all', 'demoday.admin.all', 'PL Demo Day', 'Admin access to all Demo Day hosts', NOW(), NOW()),
  ('demoday.admin.protocol_labs', 'demoday.admin.protocol_labs', 'PL Demo Day', 'Admin access to Protocol Labs Demo Day', NOW(), NOW()),
  ('demoday.admin.founders_forge', 'demoday.admin.founders_forge', 'PL Demo Day', 'Admin access to Founders Forge Demo Day', NOW(), NOW()),
  ('demoday.admin.crecimiento', 'demoday.admin.crecimiento', 'PL Demo Day', 'Admin access to Crecimiento Demo Day', NOW(), NOW()),
  ('demoday.admin.founder_school', 'demoday.admin.founder_school', 'PL Demo Day', 'Admin access to Founder School Demo Day', NOW(), NOW()),
  ('demoday.admin.crecimiento_founder_school', 'demoday.admin.crecimiento_founder_school', 'PL Demo Day', 'Admin access to Crecimiento + Founder School Demo Day', NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

DELETE FROM "PolicyPermission"
WHERE "permissionUid" IN (
  SELECT "uid" FROM "Permission"
  WHERE "code" IN (
    'demoday.prep.read', 'demoday.prep.write',
    'demoday.showcase.read', 'demoday.showcase.write',
    'demoday.active.read', 'demoday.active.write'
  )
);

DELETE FROM "Permission"
WHERE "code" IN (
  'demoday.prep.read', 'demoday.prep.write',
  'demoday.showcase.read', 'demoday.showcase.write',
  'demoday.active.read', 'demoday.active.write'
);

DELETE FROM "PolicyPermission" WHERE "policyUid" IN (
  SELECT "uid" FROM "Policy" WHERE "code" IN (
    'demo_day_stakeholder_pl_internal',
    'demo_day_admin_pl_partner',
    'demo_day_stakeholder_pl_partner'
  )
);

DELETE FROM "PolicyAssignment" WHERE "policyUid" IN (
  SELECT "uid" FROM "Policy" WHERE "code" IN (
    'demo_day_stakeholder_pl_internal',
    'demo_day_admin_pl_partner',
    'demo_day_stakeholder_pl_partner'
  )
);

DELETE FROM "Policy" WHERE "code" IN (
  'demo_day_stakeholder_pl_internal',
  'demo_day_admin_pl_partner',
  'demo_day_stakeholder_pl_partner'
);

UPDATE "Policy"
SET
  "name" = 'Demo Day Admin / PL Internal',
  "role" = 'Demo Day Admin',
  "group" = 'PL Internal',
  "updatedAt" = NOW()
WHERE "code" = 'demo_day_admin_pl_internal';

DELETE FROM "PolicyPermission"
WHERE "policyUid" = (
  SELECT "uid" FROM "Policy" WHERE "code" = 'demo_day_admin_pl_internal'
);

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" IN (
  'member.contacts.read',
  'demoday.admin.all',
  'demoday.stats.read',
  'demoday.report_link.read'
)
WHERE p."code" = 'demo_day_admin_pl_internal'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

UPDATE "Policy"
SET
  "code" = 'investor_pl_crecimiento_founder_school',
  "name" = 'Investor / Crecimiento + Founder School',
  "role" = 'Investor',
  "group" = 'Crecimiento + Founder School',
  "updatedAt" = NOW()
WHERE "code" = 'investor_pl_partner';

INSERT INTO "Policy" ("uid", "code", "name", "role", "group", "isSystem", "createdAt", "updatedAt")
VALUES (
  'policy_demo_day_admin_pl_crecimiento_founder_school',
  'demo_day_admin_pl_crecimiento_founder_school',
  'Demo Day Admin / Crecimiento + Founder School',
  'Demo Day Admin',
  'Crecimiento + Founder School',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "role" = EXCLUDED."role",
  "group" = EXCLUDED."group",
  "isSystem" = EXCLUDED."isSystem",
  "updatedAt" = NOW();

DELETE FROM "PolicyPermission"
WHERE "policyUid" = (
  SELECT "uid" FROM "Policy" WHERE "code" = 'demo_day_admin_pl_crecimiento_founder_school'
);

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" IN (
  'member.contacts.read',
  'demoday.admin.crecimiento_founder_school',
  'demoday.stats.read',
  'demoday.report_link.read'
)
WHERE p."code" = 'demo_day_admin_pl_crecimiento_founder_school'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
