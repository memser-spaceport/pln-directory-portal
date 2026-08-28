-- AlterTable
ALTER TABLE "Team" ADD COLUMN "jobReferCcEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
