-- AlterTable
ALTER TABLE "TeamPitchParticipant" ADD COLUMN     "followUpSentAt" TIMESTAMP(3),
ADD COLUMN     "followUpSentCount" INTEGER NOT NULL DEFAULT 0;
