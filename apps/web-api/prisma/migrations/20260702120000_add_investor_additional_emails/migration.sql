-- AlterTable
ALTER TABLE "InvestorOutreachRecord" ADD COLUMN "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
