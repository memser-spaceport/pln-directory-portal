-- CreateEnum
CREATE TYPE "TeamPitchStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TeamPitchParticipantType" AS ENUM ('FOUNDER', 'INVESTOR', 'SUPPORT');

-- CreateEnum
CREATE TYPE "TeamPitchParticipantAccess" AS ENUM ('VIEW', 'EDIT', 'RESTRICTED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "approveOnLogin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TeamPitch" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TeamPitchStatus" NOT NULL DEFAULT 'DRAFT',
    "supportEmail" TEXT NOT NULL,
    "headerImageUid" TEXT,
    "logoUid" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a45e6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPitchProfile" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamPitchUid" TEXT NOT NULL,
    "onePagerUploadUid" TEXT,
    "videoUploadUid" TEXT,
    "description" TEXT,
    "lastModifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPitchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPitchParticipant" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamPitchUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "type" "TeamPitchParticipantType" NOT NULL,
    "access" "TeamPitchParticipantAccess" NOT NULL,
    "teamUid" TEXT,
    "confidentialityAccepted" BOOLEAN NOT NULL DEFAULT false,
    "inviteSentAt" TIMESTAMP(3),
    "inviteSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPitchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPitchExpressInterest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamPitchUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "teamPitchProfileUid" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "invested" BOOLEAN NOT NULL DEFAULT false,
    "referral" BOOLEAN NOT NULL DEFAULT false,
    "feedback" BOOLEAN NOT NULL DEFAULT false,
    "connectedCount" INTEGER NOT NULL DEFAULT 0,
    "investedCount" INTEGER NOT NULL DEFAULT 0,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPitchExpressInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitch_uid_key" ON "TeamPitch"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitch_slug_key" ON "TeamPitch"("slug");

-- CreateIndex
CREATE INDEX "TeamPitch_teamUid_idx" ON "TeamPitch"("teamUid");

-- CreateIndex
CREATE INDEX "TeamPitch_status_idx" ON "TeamPitch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchProfile_uid_key" ON "TeamPitchProfile"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchProfile_teamPitchUid_key" ON "TeamPitchProfile"("teamPitchUid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchParticipant_uid_key" ON "TeamPitchParticipant"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchParticipant_teamPitchUid_memberUid_key" ON "TeamPitchParticipant"("teamPitchUid", "memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchExpressInterest_uid_key" ON "TeamPitchExpressInterest"("uid");

-- CreateIndex
CREATE INDEX "TeamPitchExpressInterest_memberUid_teamPitchProfileUid_idx" ON "TeamPitchExpressInterest"("memberUid", "teamPitchProfileUid");

-- CreateIndex
CREATE INDEX "TeamPitchExpressInterest_teamPitchUid_idx" ON "TeamPitchExpressInterest"("teamPitchUid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchExpressInterest_teamPitchUid_memberUid_teamPitchPr_key" ON "TeamPitchExpressInterest"("teamPitchUid", "memberUid", "teamPitchProfileUid");

-- AddForeignKey
ALTER TABLE "TeamPitch" ADD CONSTRAINT "TeamPitch_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitch" ADD CONSTRAINT "TeamPitch_headerImageUid_fkey" FOREIGN KEY ("headerImageUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitch" ADD CONSTRAINT "TeamPitch_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchProfile" ADD CONSTRAINT "TeamPitchProfile_teamPitchUid_fkey" FOREIGN KEY ("teamPitchUid") REFERENCES "TeamPitch"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchProfile" ADD CONSTRAINT "TeamPitchProfile_onePagerUploadUid_fkey" FOREIGN KEY ("onePagerUploadUid") REFERENCES "Upload"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchProfile" ADD CONSTRAINT "TeamPitchProfile_videoUploadUid_fkey" FOREIGN KEY ("videoUploadUid") REFERENCES "Upload"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchProfile" ADD CONSTRAINT "TeamPitchProfile_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchParticipant" ADD CONSTRAINT "TeamPitchParticipant_teamPitchUid_fkey" FOREIGN KEY ("teamPitchUid") REFERENCES "TeamPitch"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchParticipant" ADD CONSTRAINT "TeamPitchParticipant_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchParticipant" ADD CONSTRAINT "TeamPitchParticipant_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchExpressInterest" ADD CONSTRAINT "TeamPitchExpressInterest_teamPitchUid_fkey" FOREIGN KEY ("teamPitchUid") REFERENCES "TeamPitch"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchExpressInterest" ADD CONSTRAINT "TeamPitchExpressInterest_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPitchExpressInterest" ADD CONSTRAINT "TeamPitchExpressInterest_teamPitchProfileUid_fkey" FOREIGN KEY ("teamPitchProfileUid") REFERENCES "TeamPitchProfile"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
