/*
  Warnings:

  - You are about to drop the column `teamUid` on the `ProjectContributor` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ProjectContributor` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProjectContributor" DROP CONSTRAINT "ProjectContributor_teamUid_fkey";

-- AlterTable
ALTER TABLE "ProjectContributor" DROP COLUMN "teamUid",
DROP COLUMN "type";

-- DropEnum
DROP TYPE "ProjectContributorType";
