-- AlterTable
ALTER TABLE "SpvSpotlight" ADD COLUMN "senders" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "emailOnDataRoomRequest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SpvSpotlightParticipant" ADD COLUMN "dataRoomEmailSentAt" TIMESTAMP(3);
