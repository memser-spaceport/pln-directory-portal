-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "sentAt" TIMESTAMP(3);

-- Every application that exists today was emailed at apply time.
UPDATE "JobApplication" SET "sentAt" = "createdAt";
