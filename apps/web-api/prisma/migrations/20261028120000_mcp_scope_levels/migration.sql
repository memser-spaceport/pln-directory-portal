-- AlterTable
ALTER TABLE "McpAuthorization" ADD COLUMN     "contactAckAt" TIMESTAMP(3),
ADD COLUMN     "scopeLevels" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "McpScopeSetting" (
    "scope" TEXT NOT NULL,
    "maxLevel" TEXT NOT NULL,
    "updatedByUid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpScopeSetting_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "McpAccessRequest" (
    "uid" TEXT NOT NULL,
    "authorizationUid" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "McpAccessRequest_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "McpAccessRequest_authorizationUid_scope_createdAt_idx" ON "McpAccessRequest"("authorizationUid", "scope", "createdAt");

-- AddForeignKey
ALTER TABLE "McpAccessRequest" ADD CONSTRAINT "McpAccessRequest_authorizationUid_fkey" FOREIGN KEY ("authorizationUid") REFERENCES "McpAuthorization"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (LAB-2995): grants that allowed changes keep write on the scopes that have write tools today.
UPDATE "McpAuthorization" SET "scopeLevels" = '{"investors":"write","ai_apps":"write"}'::jsonb
WHERE "canWrite" = true AND "revokedAt" IS NULL;
