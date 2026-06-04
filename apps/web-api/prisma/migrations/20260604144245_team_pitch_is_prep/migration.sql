/*
  Warnings:

  - A unique constraint covering the columns `[teamPitchUid,memberUid,teamPitchProfileUid,isPrep]` on the table `TeamPitchExpressInterest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TeamPitchExpressInterest_teamPitchUid_memberUid_teamPitchPr_key";

-- AlterTable
ALTER TABLE "TeamPitchExpressInterest" ADD COLUMN     "isPrep" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "TeamPitchExpressInterest_teamPitchUid_memberUid_teamPitchPr_key" ON "TeamPitchExpressInterest"("teamPitchUid", "memberUid", "teamPitchProfileUid", "isPrep");
