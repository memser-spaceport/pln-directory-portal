-- AlterEnum
ALTER TYPE "DemoDayStatus" ADD VALUE 'EARLY_ACCESS';

-- AlterTable
ALTER TABLE "DemoDayParticipant" ADD COLUMN     "hasEarlyAccess" BOOLEAN NOT NULL DEFAULT false;
