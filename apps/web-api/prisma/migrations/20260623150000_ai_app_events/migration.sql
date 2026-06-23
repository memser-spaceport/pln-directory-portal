-- CreateEnum
CREATE TYPE "AiAppEventType" AS ENUM ('KIT_DOWNLOADED', 'DEPLOY_STARTED', 'DEPLOY_SUCCEEDED', 'DEPLOY_FAILED');

-- CreateTable
CREATE TABLE "AiAppEvent" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "type" "AiAppEventType" NOT NULL,
    "appUid" TEXT,
    "appId" TEXT,
    "deploymentId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAppEvent_uid_key" ON "AiAppEvent"("uid");

-- CreateIndex
CREATE INDEX "AiAppEvent_memberUid_idx" ON "AiAppEvent"("memberUid");

-- CreateIndex
CREATE INDEX "AiAppEvent_type_idx" ON "AiAppEvent"("type");

-- CreateIndex
CREATE INDEX "AiAppEvent_appUid_idx" ON "AiAppEvent"("appUid");

-- CreateIndex
CREATE INDEX "AiAppEvent_createdAt_idx" ON "AiAppEvent"("createdAt");
