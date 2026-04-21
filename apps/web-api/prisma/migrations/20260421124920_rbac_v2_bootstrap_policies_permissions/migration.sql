BEGIN;

-- =========================================================
-- 1. Seed missing permissions into existing "Permission" table
--    Safe for non-empty table
-- =========================================================
WITH seed(uid, code, description) AS (
  VALUES
    ('founder_guides.view.plvs', 'founder_guides.view.plvs', 'Seeded by RBAC v2 bootstrap'),
    ('founder_guides.view.plcc', 'founder_guides.view.plcc', 'Seeded by RBAC v2 bootstrap'),
    ('founder_guides.view.all', 'founder_guides.view.all', 'Seeded by RBAC v2 bootstrap'),
    ('founder_guides.create', 'founder_guides.create', 'Seeded by RBAC v2 bootstrap'),
    ('deals.read', 'deals.read', 'Seeded by RBAC v2 bootstrap'),
    ('forum.read', 'forum.read', 'Seeded by RBAC v2 bootstrap'),
    ('forum.write', 'forum.write', 'Seeded by RBAC v2 bootstrap'),
    ('oh.supply.read', 'oh.supply.read', 'Seeded by RBAC v2 bootstrap'),
    ('oh.supply.write', 'oh.supply.write', 'Seeded by RBAC v2 bootstrap'),
    ('oh.demand.read', 'oh.demand.read', 'Seeded by RBAC v2 bootstrap'),
    ('oh.demand.write', 'oh.demand.write', 'Seeded by RBAC v2 bootstrap'),
    ('irlg.going.read', 'irlg.going.read', 'Seeded by RBAC v2 bootstrap'),
    ('irlg.going.write', 'irlg.going.write', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.prep.read', 'demoday.prep.read', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.prep.write', 'demoday.prep.write', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.showcase.read', 'demoday.showcase.read', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.showcase.write', 'demoday.showcase.write', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.active.read', 'demoday.active.read', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.active.write', 'demoday.active.write', 'Seeded by RBAC v2 bootstrap'),
    ('demoday.stats.read', 'demoday.stats.read', 'Seeded by RBAC v2 bootstrap'),
    ('demo_day.report_link.view', 'demo_day.report_link.view', 'Seeded by RBAC v2 bootstrap'),
    ('directory.admin.full', 'directory.admin.full', 'Seeded by RBAC v2 bootstrap'),
    ('admin.tools.access', 'admin.tools.access', 'Seeded by RBAC v2 bootstrap'),
    ('team.search.read', 'team.search.read', 'Seeded by RBAC v2 bootstrap'),
    ('member.search.read', 'member.search.read', 'Seeded by RBAC v2 bootstrap'),
    ('team.priority.read', 'team.priority.read', 'Seeded by RBAC v2 bootstrap'),
    ('membership.source.read', 'membership.source.read', 'Seeded by RBAC v2 bootstrap'),
    ('member.contacts.read', 'member.contacts.read', 'Seeded by RBAC v2 bootstrap'),
    ('pl.advisors.access', 'pl.advisors.access', 'Seeded by RBAC v2 bootstrap')
)
INSERT INTO "Permission" ("uid", "code", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM "Permission" p
  WHERE p."code" = s.code
);

-- =========================================================
-- 2. Seed policies
-- =========================================================
WITH seed(uid, code, name, role, "group", is_system) AS (
  VALUES
    ('policy_directory_admin_pl_internal', 'directory_admin_pl_internal', 'Directory Admin / PL Internal', 'Directory Admin', 'PL Internal', true),
    ('policy_pl_infra_team_pl_internal', 'pl_infra_team_pl_internal', 'PL Infra Team / PL Internal', 'PL Infra team', 'PL Internal', true),
    ('policy_demo_day_admin_pl_internal', 'demo_day_admin_pl_internal', 'Demo Day Admin / PL Internal', 'Demo Day Admin', 'PL Internal', true),
    ('policy_demo_day_stakeholder_pl_internal', 'demo_day_stakeholder_pl_internal', 'Demo Day Stakeholder / PL Internal', 'Demo Day Stakeholder', 'PL Internal', true),
    ('policy_demo_day_admin_pl_partner', 'demo_day_admin_pl_partner', 'Demo Day Admin / PL Partner', 'Demo Day Admin', 'PL Partner', true),
    ('policy_demo_day_stakeholder_pl_partner', 'demo_day_stakeholder_pl_partner', 'Demo Day Stakeholder / PL Partner', 'Demo Day Stakeholder', 'PL Partner', true),
    ('policy_founder_plc_plvs', 'founder_plc_plvs', 'Founder / PLC PLVS', 'Founder', 'PLC PLVS', true),
    ('policy_founder_plc_crypto', 'founder_plc_crypto', 'Founder / PLC Crypto', 'Founder', 'PLC Crypto', true),
    ('policy_founder_plc_founder_forge', 'founder_plc_founder_forge', 'Founder / PLC Founder Forge', 'Founder', 'PLC Founder Forge', true),
    ('policy_founder_plc_neuro', 'founder_plc_neuro', 'Founder / PLC Neuro', 'Founder', 'PLC Neuro', true),
    ('policy_founder_plc_other', 'founder_plc_other', 'Founder / PLC Other', 'Founder', 'PLC Other', true),
    ('policy_founder_pln_close_contributor', 'founder_pln_close_contributor', 'Founder / PLN Close Contributor', 'Founder', 'PLN Close Contributor', true),
    ('policy_founder_pln_other', 'founder_pln_other', 'Founder / PLN Other', 'Founder', 'PLN Other', true),
    ('policy_investor_pl', 'investor_pl', 'Investor / PL', 'Investor', 'PL', true),
    ('policy_investor_pl_partner', 'investor_pl_partner', 'Investor / PL Partner', 'Investor', 'PL Partner', true),
    ('policy_unassigned_plc_plvs', 'unassigned_plc_plvs', 'Unassigned / PLC PLVS', 'Unassigned', 'PLC PLVS', true),
    ('policy_unassigned_plc_crypto', 'unassigned_plc_crypto', 'Unassigned / PLC Crypto', 'Unassigned', 'PLC Crypto', true),
    ('policy_unassigned_plc_founder_forge', 'unassigned_plc_founder_forge', 'Unassigned / PLC Founder Forge', 'Unassigned', 'PLC Founder Forge', true),
    ('policy_unassigned_plc_neuro', 'unassigned_plc_neuro', 'Unassigned / PLC Neuro', 'Unassigned', 'PLC Neuro', true),
    ('policy_unassigned_plc_other', 'unassigned_plc_other', 'Unassigned / PLC Other', 'Unassigned', 'PLC Other', true),
    ('policy_unassigned_pln_close_contributor', 'unassigned_pln_close_contributor', 'Unassigned / PLN Close Contributor', 'Unassigned', 'PLN Close Contributor', true),
    ('policy_unassigned_pln_other', 'unassigned_pln_other', 'Unassigned / PLN Other', 'Unassigned', 'PLN Other', true),
    ('policy_advisor_future', 'advisor_future', 'Advisor / Future', 'Advisor', 'Future', true)
)
INSERT INTO "Policy" ("uid", "code", "name", "description", "role", "group", "isSystem", "createdAt", "updatedAt")
SELECT uid, code, name, NULL, role, "group", is_system, NOW(), NOW()
FROM seed
  ON CONFLICT ("code") DO NOTHING;

-- =========================================================
-- 3. Seed policy-permission links
--    Safe if some links already exist
-- =========================================================
WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('directory_admin_pl_internal','directory.admin.full'),
    ('directory_admin_pl_internal','admin.tools.access'),
    ('directory_admin_pl_internal','team.search.read'),
    ('directory_admin_pl_internal','member.search.read'),
    ('directory_admin_pl_internal','team.priority.read'),
    ('directory_admin_pl_internal','membership.source.read'),
    ('directory_admin_pl_internal','founder_guides.view.all'),
    ('directory_admin_pl_internal','founder_guides.create'),
    ('directory_admin_pl_internal','deals.read'),
    ('directory_admin_pl_internal','forum.read'),
    ('directory_admin_pl_internal','forum.write'),
    ('directory_admin_pl_internal','oh.supply.read'),
    ('directory_admin_pl_internal','oh.supply.write'),
    ('directory_admin_pl_internal','oh.demand.read'),
    ('directory_admin_pl_internal','oh.demand.write'),
    ('directory_admin_pl_internal','demo_day.report_link.view'),

    ('pl_infra_team_pl_internal','team.priority.read'),
    ('pl_infra_team_pl_internal','membership.source.read'),
    ('pl_infra_team_pl_internal','founder_guides.view.all'),
    ('pl_infra_team_pl_internal','founder_guides.create'),
    ('pl_infra_team_pl_internal','deals.read'),
    ('pl_infra_team_pl_internal','forum.read'),
    ('pl_infra_team_pl_internal','forum.write'),
    ('pl_infra_team_pl_internal','oh.supply.read'),
    ('pl_infra_team_pl_internal','oh.supply.write'),
    ('pl_infra_team_pl_internal','oh.demand.read'),
    ('pl_infra_team_pl_internal','oh.demand.write'),

    ('demo_day_admin_pl_internal','demoday.prep.read'),
    ('demo_day_admin_pl_internal','demoday.prep.write'),
    ('demo_day_admin_pl_internal','demoday.showcase.read'),
    ('demo_day_admin_pl_internal','demoday.showcase.write'),
    ('demo_day_admin_pl_internal','demoday.active.read'),
    ('demo_day_admin_pl_internal','demoday.active.write'),
    ('demo_day_admin_pl_internal','demoday.stats.read'),
    ('demo_day_admin_pl_internal','demo_day.report_link.view'),

    ('demo_day_stakeholder_pl_internal','demoday.prep.read'),
    ('demo_day_stakeholder_pl_internal','demoday.showcase.read'),
    ('demo_day_stakeholder_pl_internal','demoday.active.read'),
    ('demo_day_stakeholder_pl_internal','demoday.stats.read'),

    ('demo_day_admin_pl_partner','demoday.prep.read'),
    ('demo_day_admin_pl_partner','demoday.prep.write'),
    ('demo_day_admin_pl_partner','demoday.showcase.read'),
    ('demo_day_admin_pl_partner','demoday.showcase.write'),
    ('demo_day_admin_pl_partner','demoday.active.read'),
    ('demo_day_admin_pl_partner','demoday.active.write'),
    ('demo_day_admin_pl_partner','demoday.stats.read'),
    ('demo_day_admin_pl_partner','demo_day.report_link.view'),

    ('demo_day_stakeholder_pl_partner','demoday.prep.read'),
    ('demo_day_stakeholder_pl_partner','demoday.showcase.read'),
    ('demo_day_stakeholder_pl_partner','demoday.active.read'),
    ('demo_day_stakeholder_pl_partner','demoday.stats.read'),

    ('founder_plc_plvs','member.contacts.read'),
    ('founder_plc_plvs','irlg.going.read'),
    ('founder_plc_plvs','irlg.going.write'),
    ('founder_plc_plvs','oh.supply.read'),
    ('founder_plc_plvs','oh.supply.write'),
    ('founder_plc_plvs','oh.demand.read'),
    ('founder_plc_plvs','oh.demand.write'),
    ('founder_plc_plvs','forum.read'),
    ('founder_plc_plvs','forum.write'),
    ('founder_plc_plvs','deals.read'),
    ('founder_plc_plvs','founder_guides.view.plvs'),
    ('founder_plc_plvs','demoday.prep.read'),
    ('founder_plc_plvs','demoday.prep.write'),
    ('founder_plc_plvs','demoday.active.read'),
    ('founder_plc_plvs','demoday.active.write'),

    ('founder_plc_crypto','member.contacts.read'),
    ('founder_plc_crypto','irlg.going.read'),
    ('founder_plc_crypto','irlg.going.write'),
    ('founder_plc_crypto','oh.supply.read'),
    ('founder_plc_crypto','oh.supply.write'),
    ('founder_plc_crypto','oh.demand.read'),
    ('founder_plc_crypto','oh.demand.write'),
    ('founder_plc_crypto','forum.read'),
    ('founder_plc_crypto','forum.write'),
    ('founder_plc_crypto','deals.read'),
    ('founder_plc_crypto','founder_guides.view.plcc'),
    ('founder_plc_crypto','demoday.prep.read'),
    ('founder_plc_crypto','demoday.prep.write'),
    ('founder_plc_crypto','demoday.active.read'),
    ('founder_plc_crypto','demoday.active.write'),

    ('founder_plc_founder_forge','member.contacts.read'),
    ('founder_plc_founder_forge','irlg.going.read'),
    ('founder_plc_founder_forge','irlg.going.write'),
    ('founder_plc_founder_forge','oh.supply.read'),
    ('founder_plc_founder_forge','oh.supply.write'),
    ('founder_plc_founder_forge','oh.demand.read'),
    ('founder_plc_founder_forge','oh.demand.write'),
    ('founder_plc_founder_forge','forum.read'),
    ('founder_plc_founder_forge','forum.write'),
    ('founder_plc_founder_forge','deals.read'),

    ('founder_plc_neuro','member.contacts.read'),
    ('founder_plc_neuro','irlg.going.read'),
    ('founder_plc_neuro','irlg.going.write'),
    ('founder_plc_neuro','oh.supply.read'),
    ('founder_plc_neuro','oh.supply.write'),
    ('founder_plc_neuro','oh.demand.read'),
    ('founder_plc_neuro','oh.demand.write'),
    ('founder_plc_neuro','forum.read'),
    ('founder_plc_neuro','forum.write'),
    ('founder_plc_neuro','demoday.prep.read'),
    ('founder_plc_neuro','demoday.prep.write'),
    ('founder_plc_neuro','demoday.active.read'),
    ('founder_plc_neuro','demoday.active.write'),

    ('founder_plc_other','member.contacts.read'),
    ('founder_plc_other','irlg.going.read'),
    ('founder_plc_other','irlg.going.write'),
    ('founder_plc_other','oh.supply.read'),
    ('founder_plc_other','oh.supply.write'),
    ('founder_plc_other','oh.demand.read'),
    ('founder_plc_other','oh.demand.write'),
    ('founder_plc_other','forum.read'),
    ('founder_plc_other','forum.write'),
    ('founder_plc_other','deals.read'),

    ('founder_pln_close_contributor','member.contacts.read'),
    ('founder_pln_close_contributor','irlg.going.read'),
    ('founder_pln_close_contributor','irlg.going.write'),
    ('founder_pln_close_contributor','oh.supply.read'),
    ('founder_pln_close_contributor','oh.supply.write'),
    ('founder_pln_close_contributor','oh.demand.read'),
    ('founder_pln_close_contributor','oh.demand.write'),
    ('founder_pln_close_contributor','forum.read'),
    ('founder_pln_close_contributor','forum.write'),
    ('founder_pln_close_contributor','deals.read'),

    ('founder_pln_other','member.contacts.read'),
    ('founder_pln_other','irlg.going.read'),
    ('founder_pln_other','irlg.going.write'),
    ('founder_pln_other','oh.supply.read'),
    ('founder_pln_other','oh.supply.write'),
    ('founder_pln_other','oh.demand.read'),
    ('founder_pln_other','oh.demand.write'),
    ('founder_pln_other','forum.read'),
    ('founder_pln_other','forum.write'),
    ('founder_pln_other','deals.read'),

    ('investor_pl','member.contacts.read'),
    ('investor_pl','irlg.going.read'),
    ('investor_pl','oh.demand.read'),
    ('investor_pl','demoday.active.read'),

    ('investor_pl_partner','member.contacts.read'),
    ('investor_pl_partner','oh.demand.read'),
    ('investor_pl_partner','demoday.active.read'),

    ('advisor_future','member.contacts.read'),
    ('advisor_future','oh.supply.read'),
    ('advisor_future','oh.supply.write'),
    ('advisor_future','oh.demand.read'),
    ('advisor_future','oh.demand.write'),
    ('advisor_future','pl.advisors.access')
)
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM mappings m
       JOIN "Policy" p ON p."code" = m.policy_code
       JOIN "Permission" perm ON perm."code" = m.permission_code
WHERE NOT EXISTS (
  SELECT 1
  FROM "PolicyPermission" pp
  WHERE pp."policyUid" = p."uid"
    AND pp."permissionUid" = perm."uid"
);

COMMIT;
