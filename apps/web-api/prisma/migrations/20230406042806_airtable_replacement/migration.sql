-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('MEMBER', 'TEAM');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "linkedinHandler" TEXT,
ADD COLUMN     "moreDetails" TEXT,
ADD COLUMN     "plnStartDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "plnFriend" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "linkedinHandler" TEXT,
ADD COLUMN     "moreDetails" TEXT,
ADD COLUMN     "officeHours" TEXT,
ALTER COLUMN "plnFriend" SET DEFAULT false;

-- AlterTable
ALTER TABLE "TeamMemberRole" ALTER COLUMN "mainTeam" SET DEFAULT false,
ALTER COLUMN "teamLead" SET DEFAULT false;

-- CreateTable
CREATE TABLE "ParticipantsRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "participantType" "ParticipantType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "oldData" JSONB,
    "newData" JSONB NOT NULL,
    "referenceUid" TEXT,
    "editRequestorEmailId" TEXT,
    "uniqueIdentifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantsRequest_uid_key" ON "ParticipantsRequest"("uid");
