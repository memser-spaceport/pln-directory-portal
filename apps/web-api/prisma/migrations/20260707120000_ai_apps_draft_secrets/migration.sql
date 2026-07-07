-- AI Apps: draft apps with runtime secrets.
-- An agent can now register a DRAFT app that declares which env var NAMES the
-- app needs; the member provides the values in LabOS (values go straight to the
-- sandbox runner's secret store — never stored here) and triggers the deploy.

ALTER TYPE "AiAppStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'DRAFT_CREATED';
ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'SECRETS_UPDATED';

ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "requiredEnvVars" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "providedEnvVars" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
