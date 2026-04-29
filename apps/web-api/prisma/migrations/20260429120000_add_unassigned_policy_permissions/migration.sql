BEGIN;

WITH mappings(policy_code, permission_code) AS (
  VALUES
    -- Unassigned / PLC PLVS
    ('unassigned_plc_plvs','member.contacts.read'),
    ('unassigned_plc_plvs','irlg.going.read'),
    ('unassigned_plc_plvs','irlg.going.write'),
    ('unassigned_plc_plvs','oh.supply.read'),
    ('unassigned_plc_plvs','oh.supply.write'),
    ('unassigned_plc_plvs','oh.demand.read'),
    ('unassigned_plc_plvs','oh.demand.write'),
    ('unassigned_plc_plvs','forum.read'),
    ('unassigned_plc_plvs','forum.write'),

    -- Unassigned / PLC Crypto
    ('unassigned_plc_crypto','member.contacts.read'),
    ('unassigned_plc_crypto','irlg.going.read'),
    ('unassigned_plc_crypto','irlg.going.write'),
    ('unassigned_plc_crypto','oh.supply.read'),
    ('unassigned_plc_crypto','oh.supply.write'),
    ('unassigned_plc_crypto','oh.demand.read'),
    ('unassigned_plc_crypto','oh.demand.write'),
    ('unassigned_plc_crypto','forum.read'),
    ('unassigned_plc_crypto','forum.write'),

    -- Unassigned / PLC Founder Forge
    ('unassigned_plc_founder_forge','member.contacts.read'),
    ('unassigned_plc_founder_forge','irlg.going.read'),
    ('unassigned_plc_founder_forge','irlg.going.write'),
    ('unassigned_plc_founder_forge','oh.supply.read'),
    ('unassigned_plc_founder_forge','oh.supply.write'),
    ('unassigned_plc_founder_forge','oh.demand.read'),
    ('unassigned_plc_founder_forge','oh.demand.write'),
    ('unassigned_plc_founder_forge','forum.read'),
    ('unassigned_plc_founder_forge','forum.write'),

    -- Unassigned / PLC Neuro
    ('unassigned_plc_neuro','member.contacts.read'),
    ('unassigned_plc_neuro','irlg.going.read'),
    ('unassigned_plc_neuro','irlg.going.write'),
    ('unassigned_plc_neuro','oh.supply.read'),
    ('unassigned_plc_neuro','oh.supply.write'),
    ('unassigned_plc_neuro','oh.demand.read'),
    ('unassigned_plc_neuro','oh.demand.write'),
    ('unassigned_plc_neuro','forum.read'),
    ('unassigned_plc_neuro','forum.write'),

    -- Unassigned / PLN Close Contributor
    ('unassigned_pln_close_contributor','member.contacts.read'),
    ('unassigned_pln_close_contributor','irlg.going.read'),
    ('unassigned_pln_close_contributor','irlg.going.write'),
    ('unassigned_pln_close_contributor','oh.supply.read'),
    ('unassigned_pln_close_contributor','oh.supply.write'),
    ('unassigned_pln_close_contributor','oh.demand.read'),
    ('unassigned_pln_close_contributor','oh.demand.write'),
    ('unassigned_pln_close_contributor','forum.read'),
    ('unassigned_pln_close_contributor','forum.write'),

    -- Unassigned / PLC Other: doc says OH + IRLG, no Forum
    ('unassigned_plc_other','member.contacts.read'),
    ('unassigned_plc_other','irlg.going.read'),
    ('unassigned_plc_other','irlg.going.write'),
    ('unassigned_plc_other','oh.supply.read'),
    ('unassigned_plc_other','oh.supply.write'),
    ('unassigned_plc_other','oh.demand.read'),
    ('unassigned_plc_other','oh.demand.write'),

    -- Unassigned / PLN Other: doc says OH + IRLG, no Forum
    ('unassigned_pln_other','member.contacts.read'),
    ('unassigned_pln_other','irlg.going.read'),
    ('unassigned_pln_other','irlg.going.write'),
    ('unassigned_pln_other','oh.supply.read'),
    ('unassigned_pln_other','oh.supply.write'),
    ('unassigned_pln_other','oh.demand.read'),
    ('unassigned_pln_other','oh.demand.write')
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
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
