-- CreateTable
CREATE TABLE "JobMatchCriteriaOverride" (
    "uid" TEXT NOT NULL,
    "roleUid" TEXT NOT NULL,
    "roleTextHash" TEXT NOT NULL,
    "disabled" TEXT[],
    "updatedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatchCriteriaOverride_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "JobMatchContact" (
    "uid" TEXT NOT NULL,
    "roleUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "senderUid" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatchContact_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchCriteriaOverride_roleUid_roleTextHash_key" ON "JobMatchCriteriaOverride"("roleUid", "roleTextHash");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchContact_roleUid_memberUid_key" ON "JobMatchContact"("roleUid", "memberUid");

