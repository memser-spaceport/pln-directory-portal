-- AI Apps: agent-driven database provisioning. The agent can ask the
-- Deployment Orchestrator to provision a Postgres database for an app
-- (opt-in convenience for non-technical builders); these columns track the
-- request and the non-sensitive connection metadata the orchestrator returns.
-- The password is never stored — only injected into the app's runtime pod.
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseType" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseHost" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databasePort" INTEGER;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseName" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseUser" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "databaseCredentialsInjected" BOOLEAN;
