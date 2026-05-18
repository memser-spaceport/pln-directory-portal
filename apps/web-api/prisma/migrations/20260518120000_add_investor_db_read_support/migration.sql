-- AlterTable
ALTER TABLE "InvestorOutreachRecord" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "InvestorPortfolioOverlap" (
    "id" SERIAL NOT NULL,
    "investorOutreachRecordId" INTEGER NOT NULL,
    "teamUid" TEXT NOT NULL,
    "dealAmount" DECIMAL(18,2),
    "dealDate" DATE,
    "dealStage" TEXT,
    "isLeadInvestor" BOOLEAN NOT NULL DEFAULT false,
    "attributionFund" TEXT,
    "sourceDataset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorPortfolioOverlap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestorPortfolioOverlap_investorOutreachRecordId_idx" ON "InvestorPortfolioOverlap"("investorOutreachRecordId");

-- CreateIndex
CREATE INDEX "InvestorPortfolioOverlap_teamUid_idx" ON "InvestorPortfolioOverlap"("teamUid");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorPortfolioOverlap_investorOutreachRecordId_teamUid_key" ON "InvestorPortfolioOverlap"("investorOutreachRecordId", "teamUid");

-- AddForeignKey
ALTER TABLE "InvestorPortfolioOverlap" ADD CONSTRAINT "InvestorPortfolioOverlap_investorOutreachRecordId_fkey" FOREIGN KEY ("investorOutreachRecordId") REFERENCES "InvestorOutreachRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorPortfolioOverlap" ADD CONSTRAINT "InvestorPortfolioOverlap_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlPortfolioTeamMeta" (
    "id" SERIAL NOT NULL,
    "teamUid" TEXT NOT NULL,
    "plInvestedAt" DATE,
    "plInvestedStage" TEXT,
    "raisingNow" TEXT,
    "sectors" TEXT,
    "geo" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlPortfolioTeamMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlPortfolioTeamMeta_teamUid_key" ON "PlPortfolioTeamMeta"("teamUid");

-- AddForeignKey
ALTER TABLE "PlPortfolioTeamMeta" ADD CONSTRAINT "PlPortfolioTeamMeta_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
