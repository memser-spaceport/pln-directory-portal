-- CreateTable
CREATE TABLE "McpLimitOverride" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdByUid" TEXT,
    "updatedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpLimitOverride_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "McpLimitChange" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "limit" INTEGER,
    "endsAt" TIMESTAMP(3),
    "actorUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpLimitChange_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "McpLimitHit" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "hitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpLimitHit_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpLimitOverride_memberUid_callType_key" ON "McpLimitOverride"("memberUid", "callType");

-- CreateIndex
CREATE INDEX "McpLimitOverride_endsAt_idx" ON "McpLimitOverride"("endsAt");

-- CreateIndex
CREATE INDEX "McpLimitChange_memberUid_createdAt_idx" ON "McpLimitChange"("memberUid", "createdAt");

-- CreateIndex
CREATE INDEX "McpLimitChange_createdAt_idx" ON "McpLimitChange"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpLimitHit_memberUid_callType_resetsAt_key" ON "McpLimitHit"("memberUid", "callType", "resetsAt");

-- CreateIndex
CREATE INDEX "McpLimitHit_hitAt_idx" ON "McpLimitHit"("hitAt");

-- AddForeignKey
ALTER TABLE "McpLimitOverride" ADD CONSTRAINT "McpLimitOverride_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpLimitHit" ADD CONSTRAINT "McpLimitHit_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
