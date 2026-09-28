-- Persistent dev deploy target next to prod, plus hashed LabOS deployment keys.

CREATE TYPE "AiAppTargetEnvironment" AS ENUM ('prod', 'dev');

CREATE TABLE "AiAppTarget" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "appUid" TEXT NOT NULL,
    "environment" "AiAppTargetEnvironment" NOT NULL,
    "status" "AiAppStatus" NOT NULL DEFAULT 'IN_DEVELOPMENT',
    "notes" TEXT,
    "url" TEXT,
    "httpUrl" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "deploymentId" TEXT,
    "s3Key" TEXT,
    "requiredEnvVars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providedEnvVars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kitVersion" TEXT,
    "agentClient" TEXT,
    "agentModel" TEXT,
    "lastDeployedAt" TIMESTAMP(3),
    "failureStream" TEXT,
    "database" JSONB,
    "directLinkGateReady" BOOLEAN NOT NULL DEFAULT false,
    "publicPathsGateReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAppTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAppTarget_uid_key" ON "AiAppTarget"("uid");
CREATE UNIQUE INDEX "AiAppTarget_appUid_environment_key" ON "AiAppTarget"("appUid", "environment");
CREATE INDEX "AiAppTarget_appUid_idx" ON "AiAppTarget"("appUid");

-- Existing apps become the prod target. Dev starts empty.
INSERT INTO "AiAppTarget" (
    "uid",
    "appUid",
    "environment",
    "status",
    "notes",
    "url",
    "httpUrl",
    "host",
    "port",
    "deploymentId",
    "s3Key",
    "requiredEnvVars",
    "providedEnvVars",
    "kitVersion",
    "agentClient",
    "agentModel",
    "lastDeployedAt",
    "failureStream",
    "database",
    "directLinkGateReady",
    "publicPathsGateReady",
    "createdAt",
    "updatedAt"
)
SELECT
    a."uid" || '-prod',
    a."uid",
    'prod'::"AiAppTargetEnvironment",
    a."status",
    a."notes",
    a."url",
    a."httpUrl",
    a."host",
    a."port",
    a."deploymentId",
    a."s3Key",
    a."requiredEnvVars",
    a."providedEnvVars",
    a."kitVersion",
    a."agentClient",
    a."agentModel",
    a."lastDeployedAt",
    a."failureStream",
    a."database",
    a."directLinkGateReady",
    a."publicPathsGateReady",
    a."createdAt",
    a."updatedAt"
FROM "AiApp" a;

CREATE TABLE "AiAppDeployKey" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "appUid" TEXT NOT NULL,
    "environment" "AiAppTargetEnvironment" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppDeployKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAppDeployKey_uid_key" ON "AiAppDeployKey"("uid");
CREATE UNIQUE INDEX "AiAppDeployKey_tokenHash_key" ON "AiAppDeployKey"("tokenHash");
CREATE INDEX "AiAppDeployKey_appUid_idx" ON "AiAppDeployKey"("appUid");
