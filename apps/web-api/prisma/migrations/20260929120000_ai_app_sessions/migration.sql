-- App-scoped member sessions for deployed AI Apps, their one-time sign-in codes, and per-target auth gate state (LAB-2695).

CREATE TABLE "AiAppSession" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AiAppSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAppSession_uid_key" ON "AiAppSession"("uid");
CREATE UNIQUE INDEX "AiAppSession_tokenHash_key" ON "AiAppSession"("tokenHash");
CREATE INDEX "AiAppSession_memberUid_revokedAt_idx" ON "AiAppSession"("memberUid", "revokedAt");
CREATE INDEX "AiAppSession_expiresAt_idx" ON "AiAppSession"("expiresAt");

CREATE TABLE "AiAppSessionCode" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "environment" "AiAppTargetEnvironment" NOT NULL,
    "memberUid" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppSessionCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAppSessionCode_uid_key" ON "AiAppSessionCode"("uid");
CREATE UNIQUE INDEX "AiAppSessionCode_codeHash_key" ON "AiAppSessionCode"("codeHash");
CREATE INDEX "AiAppSessionCode_expiresAt_idx" ON "AiAppSessionCode"("expiresAt");

CREATE TABLE "AiAppAuthGate" (
    "id" SERIAL NOT NULL,
    "appUid" TEXT NOT NULL,
    "environment" "AiAppTargetEnvironment" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "previousRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAppAuthGate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAppAuthGate_appUid_environment_key" ON "AiAppAuthGate"("appUid", "environment");
