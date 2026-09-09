-- AlterTable
ALTER TABLE "JobReferral" ADD COLUMN     "referredEmail" TEXT,
ADD COLUMN     "referredLinkedinUrl" TEXT,
ADD COLUMN     "referredName" TEXT,
ALTER COLUMN "referredMemberUid" DROP NOT NULL;

