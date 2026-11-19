-- LabOS agent pilot policy (LAB-3344, decision D1 option A). Holds labos_agent.use.
-- Assign this policy in Back Office to add staff or a pilot member.
-- Additive and idempotent: ON CONFLICT DO NOTHING. No row is changed or deleted.

BEGIN;

INSERT INTO "Policy" ("uid", "code", "name", "description", "role", "group", "isSystem", "hidden", "createdAt", "updatedAt")
VALUES (
  'policy_labos_agent_pilot',
  'labos_agent_pilot',
  'LabOS Agent Pilot',
  'Pilot gate for the LabOS agent. Assign this policy to grant labos_agent.use.',
  'LabOS Agent Pilot',
  'LabOS Agent',
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_labos_agent_pilot_labos_agent_use',
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" = 'labos_agent.use'
WHERE p."code" = 'labos_agent_pilot'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;

COMMIT;
