-- AI Apps: agent-driven database provisioning. The agent can ask the
-- Deployment Orchestrator to provision a Postgres database for an app
-- (opt-in convenience for non-technical builders). Stored as a single JSON
-- blob, mirroring the `database` block returned in the API response, since
-- these fields are always read/written together and never queried
-- individually. The password is never stored — only injected into the app's
-- runtime pod.
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "database" JSONB;
