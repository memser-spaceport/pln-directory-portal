-- AI Apps: debugging metadata about each app's last agent upload (deploy or
-- draft registration). All values are self-reported by the agent/kit and NULL
-- for uploads from older kits that didn't send them.
--   kitVersion  — starter-kit version (from the kit's pln-app.config.json)
--   agentClient — AI tool name from the connect session's clientName (e.g. "Claude Code")
--   agentModel  — model the agent reports running on (e.g. "claude-sonnet-4-5")

ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "kitVersion" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "agentClient" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "agentModel" TEXT;
