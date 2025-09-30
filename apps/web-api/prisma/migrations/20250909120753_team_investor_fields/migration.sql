/*
  Warnings:

  - A unique constraint covering the columns `[investorProfileId]` on the table `Member` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[investorProfileId]` on the table `Team` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "investorProfileId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "investorProfileId" TEXT;

-- CreateTable
CREATE TABLE "InvestorProfile" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "investmentFocus" TEXT[],
    "typicalCheckSize" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamUid" TEXT,
    "memberUid" TEXT,

    CONSTRAINT "InvestorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorProfile_uid_key" ON "InvestorProfile"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorProfile_teamUid_key" ON "InvestorProfile"("teamUid");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorProfile_memberUid_key" ON "InvestorProfile"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "Member_investorProfileId_key" ON "Member"("investorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_investorProfileId_key" ON "Team"("investorProfileId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_investorProfileId_fkey" FOREIGN KEY ("investorProfileId") REFERENCES "InvestorProfile"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_investorProfileId_fkey" FOREIGN KEY ("investorProfileId") REFERENCES "InvestorProfile"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
