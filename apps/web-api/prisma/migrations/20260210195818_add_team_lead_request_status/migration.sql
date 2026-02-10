-- CreateEnum
CREATE TYPE "TeamLeadRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DemoDayParticipant"
  ADD COLUMN "teamLeadRequestStatus" "TeamLeadRequestStatus";

