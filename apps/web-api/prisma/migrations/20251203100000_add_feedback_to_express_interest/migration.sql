-- AlterTable
ALTER TABLE "DemoDayExpressInterestStatistic" ADD COLUMN "feedback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DemoDayExpressInterestStatistic" ADD COLUMN "feedbackCount" INTEGER NOT NULL DEFAULT 0;
