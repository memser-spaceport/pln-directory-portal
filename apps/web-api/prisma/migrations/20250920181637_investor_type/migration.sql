-- CreateEnum
CREATE TYPE "InvestorProfileType" AS ENUM ('ANGEL', 'FUND', 'ANGEL_AND_FUND');

-- AlterTable
ALTER TABLE "InvestorProfile" ADD COLUMN     "type" "InvestorProfileType";
