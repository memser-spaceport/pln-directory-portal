/*
  Warnings:

  - You are about to drop the column `focusAreaUid` on the `TeamFundraisingProfile` table. All the data in the column will be lost.
  - You are about to drop the column `fundingStageUid` on the `TeamFundraisingProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[teamUid,demoDayUid]` on the table `TeamFundraisingProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `demoDayUid` to the `TeamFundraisingProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DemoDayStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DemoDayParticipantType" AS ENUM ('INVESTOR', 'FOUNDER');

-- CreateEnum
CREATE TYPE "DemoDayParticipantStatus" AS ENUM ('INVITED', 'ENABLED', 'DISABLED');

-- DropForeignKey
ALTER TABLE "TeamFundraisingProfile" DROP CONSTRAINT "TeamFundraisingProfile_focusAreaUid_fkey";

-- DropForeignKey
ALTER TABLE "TeamFundraisingProfile" DROP CONSTRAINT "TeamFundraisingProfile_fundingStageUid_fkey";

-- DropIndex
ALTER TABLE "TeamFundraisingProfile" DROP CONSTRAINT "TeamFundraisingProfile_teamUid_key";
DROP INDEX IF EXISTS "TeamFundraisingProfile_teamUid_key";

-- AlterTable
ALTER TABLE "TeamFundraisingProfile" DROP COLUMN "focusAreaUid",
DROP COLUMN "fundingStageUid",
ADD COLUMN     "demoDayUid" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "DemoDay" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DemoDayStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DemoDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoDayParticipant" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "demoDayUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "type" "DemoDayParticipantType" NOT NULL,
    "status" "DemoDayParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "teamUid" TEXT,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DemoDayParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoDay_uid_key" ON "DemoDay"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayParticipant_uid_key" ON "DemoDayParticipant"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayParticipant_demoDayUid_memberUid_key" ON "DemoDayParticipant"("demoDayUid", "memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamFundraisingProfile_teamUid_demoDayUid_key" ON "TeamFundraisingProfile"("teamUid", "demoDayUid");

-- AddForeignKey
ALTER TABLE "TeamFundraisingProfile" ADD CONSTRAINT "TeamFundraisingProfile_demoDayUid_fkey" FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayParticipant" ADD CONSTRAINT "DemoDayParticipant_demoDayUid_fkey" FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayParticipant" ADD CONSTRAINT "DemoDayParticipant_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayParticipant" ADD CONSTRAINT "DemoDayParticipant_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
