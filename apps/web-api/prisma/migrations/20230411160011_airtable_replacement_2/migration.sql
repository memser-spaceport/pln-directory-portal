/*
  Warnings:

  - You are about to drop the column `editRequestorEmailId` on the `ParticipantsRequest` table. All the data in the column will be lost.
  - Added the required column `requesterEmailId` to the `ParticipantsRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ParticipantsRequest" DROP COLUMN "editRequestorEmailId",
ADD COLUMN     "requesterEmailId" TEXT NOT NULL;
