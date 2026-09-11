-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "hasInactiveEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "hasInactiveLeadEmails" BOOLEAN NOT NULL DEFAULT false;
