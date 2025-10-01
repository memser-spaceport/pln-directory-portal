-- AlterTable
ALTER TABLE "InvestorProfile" ADD COLUMN     "isInvestViaFund" BOOLEAN;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "isFund" BOOLEAN NOT NULL DEFAULT false;
