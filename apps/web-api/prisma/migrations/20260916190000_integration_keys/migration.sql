-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "integrationKeyUid" TEXT;

-- CreateTable
CREATE TABLE "IntegrationKey" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationKey_uid_key" ON "IntegrationKey"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationKey_keyHash_key" ON "IntegrationKey"("keyHash");

-- CreateIndex
CREATE INDEX "IntegrationKey_teamUid_idx" ON "IntegrationKey"("teamUid");

-- CreateIndex
CREATE INDEX "JobOpening_integrationKeyUid_idx" ON "JobOpening"("integrationKeyUid");

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_integrationKeyUid_fkey" FOREIGN KEY ("integrationKeyUid") REFERENCES "IntegrationKey"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationKey" ADD CONSTRAINT "IntegrationKey_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationKey" ADD CONSTRAINT "IntegrationKey_createdByUid_fkey" FOREIGN KEY ("createdByUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

