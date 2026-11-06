-- CreateTable
CREATE TABLE "MemberSignal" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityUid" TEXT NOT NULL,
    "own" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberSignal_uid_key" ON "MemberSignal"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSignal_sourceKey_key" ON "MemberSignal"("sourceKey");

-- CreateIndex
CREATE INDEX "MemberSignal_memberUid_createdAt_idx" ON "MemberSignal"("memberUid", "createdAt");

-- CreateIndex
CREATE INDEX "MemberSignal_entityType_entityUid_idx" ON "MemberSignal"("entityType", "entityUid");

-- CreateIndex
CREATE INDEX "MemberSignal_memberUid_action_entityType_entityUid_createdA_idx" ON "MemberSignal"("memberUid", "action", "entityType", "entityUid", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberSignal" ADD CONSTRAINT "MemberSignal_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

