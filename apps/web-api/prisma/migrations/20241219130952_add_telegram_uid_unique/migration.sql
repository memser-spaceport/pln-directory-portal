/*
  Warnings:

  - A unique constraint covering the columns `[telegramHandler]` on the table `Member` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramUid]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "telegramUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_telegramHandler_key" ON "Member"("telegramHandler");

-- CreateIndex
CREATE UNIQUE INDEX "Member_telegramUid_key" ON "Member"("telegramUid");
