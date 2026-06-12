-- Investor Lists v1: curated target sets of investors + their membership join.
-- A list ties to PathfinderPath.targetSet so per-list proximity codes resolve.

-- CreateTable
CREATE TABLE "InvestorList" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "source" VARCHAR(24) NOT NULL,
    "externalRef" VARCHAR(120),
    "isGraphed" BOOLEAN NOT NULL DEFAULT false,
    "targetSet" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorListMembership" (
    "id" SERIAL NOT NULL,
    "listId" INTEGER NOT NULL,
    "investorOutreachRecordId" INTEGER NOT NULL,
    "addedByUid" VARCHAR(64),
    "addedByEmail" VARCHAR(200),
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestorListMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorList_slug_key" ON "InvestorList"("slug");

-- CreateIndex
CREATE INDEX "InvestorList_source_idx" ON "InvestorList"("source");

-- CreateIndex
CREATE INDEX "InvestorList_targetSet_idx" ON "InvestorList"("targetSet");

-- CreateIndex
CREATE INDEX "InvestorListMembership_listId_idx" ON "InvestorListMembership"("listId");

-- CreateIndex
CREATE INDEX "InvestorListMembership_investorOutreachRecordId_idx" ON "InvestorListMembership"("investorOutreachRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorListMembership_listId_investorOutreachRecordId_key" ON "InvestorListMembership"("listId", "investorOutreachRecordId");

-- AddForeignKey
ALTER TABLE "InvestorListMembership" ADD CONSTRAINT "InvestorListMembership_listId_fkey" FOREIGN KEY ("listId") REFERENCES "InvestorList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorListMembership" ADD CONSTRAINT "InvestorListMembership_investorOutreachRecordId_fkey" FOREIGN KEY ("investorOutreachRecordId") REFERENCES "InvestorOutreachRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
