/*
  Warnings:

  - You are about to drop the column `openForWork` on the `Member` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Member" DROP COLUMN "openForWork",
ADD COLUMN     "telegramHandler" TEXT,
ALTER COLUMN "plnStartDate" DROP DEFAULT,
ALTER COLUMN "openToWork" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "telegramHandler" TEXT;
