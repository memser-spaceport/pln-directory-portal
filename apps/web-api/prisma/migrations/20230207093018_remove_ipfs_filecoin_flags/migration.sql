/*
  Warnings:

  - You are about to drop the column `filecoinUser` on the `Team` table. All the data in the column will be lost.
  - You are about to drop the column `ipfsUser` on the `Team` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Team" DROP COLUMN "filecoinUser",
DROP COLUMN "ipfsUser";
