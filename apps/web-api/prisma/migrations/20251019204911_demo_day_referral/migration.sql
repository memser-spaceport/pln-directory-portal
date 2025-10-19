-- AlterTable
ALTER TABLE "DemoDayExpressInterestStatistic" ADD COLUMN     "referral" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralCount" INTEGER NOT NULL DEFAULT 0;
