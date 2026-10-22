-- CreateTable
CREATE TABLE "McpUsedRefreshToken" (
    "tokenHash" TEXT NOT NULL,
    "authorizationUid" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUsedRefreshToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "McpUsedRefreshToken_authorizationUid_idx" ON "McpUsedRefreshToken"("authorizationUid");

-- CreateIndex
CREATE INDEX "McpUsedRefreshToken_usedAt_idx" ON "McpUsedRefreshToken"("usedAt");

-- AddForeignKey
ALTER TABLE "McpUsedRefreshToken" ADD CONSTRAINT "McpUsedRefreshToken_authorizationUid_fkey" FOREIGN KEY ("authorizationUid") REFERENCES "McpAuthorization"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
