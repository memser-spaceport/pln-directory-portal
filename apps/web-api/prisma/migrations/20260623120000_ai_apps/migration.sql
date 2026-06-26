-- CreateEnum
CREATE TYPE "AiAppStatus" AS ENUM ('IN_DEVELOPMENT', 'DEPLOYING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "AiApp" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AiAppStatus" NOT NULL DEFAULT 'IN_DEVELOPMENT',
    "notes" TEXT,
    "url" TEXT,
    "httpUrl" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "deploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAppToken" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAppToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiApp_uid_key" ON "AiApp"("uid");

-- CreateIndex
CREATE INDEX "AiApp_memberUid_idx" ON "AiApp"("memberUid");

-- CreateIndex
CREATE INDEX "AiApp_status_idx" ON "AiApp"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AiApp_memberUid_appId_key" ON "AiApp"("memberUid", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAppToken_uid_key" ON "AiAppToken"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "AiAppToken_memberUid_key" ON "AiAppToken"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "AiAppToken_token_key" ON "AiAppToken"("token");

-- Seed AI Apps permissions
INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
SELECT 'ai_apps.read', 'ai_apps.read', 'View AI Apps and their deploy status', 'AI Apps', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'ai_apps.read');

INSERT INTO "Permission" ("uid", "code", "description", "module", "createdAt", "updatedAt")
SELECT 'ai_apps.write', 'ai_apps.write', 'Download the AI Apps starter kit and deploy apps', 'AI Apps', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'ai_apps.write');

-- Attach AI Apps permissions to the PL Infra Team policy (POC: PL Infra users)
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM "Policy" p
JOIN "Permission" perm ON perm."code" IN ('ai_apps.read', 'ai_apps.write')
WHERE p."code" = 'pl_infra_team_pl_internal'
ON CONFLICT ("policyUid", "permissionUid") DO NOTHING;
