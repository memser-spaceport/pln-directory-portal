-- AlterTable
ALTER TABLE "DemoDayExpressInterestStatistic" ADD COLUMN     "saved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "savedCount" INTEGER NOT NULL DEFAULT 0;
