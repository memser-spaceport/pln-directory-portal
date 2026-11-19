-- Entry permission for the LabOS agent (LAB-3344, decision D1 option A).
-- On production only members with this permission see the agent. Grant it through
-- the labos_agent_pilot policy in Back Office (or directly per member).
-- Additive and idempotent: no row is changed or deleted.

BEGIN;

INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
VALUES ('labos_agent.use', 'labos_agent.use', 'See and use the LabOS agent', 'LabOS Agent', NOW(), NOW())
ON CONFLICT DO NOTHING;

COMMIT;
