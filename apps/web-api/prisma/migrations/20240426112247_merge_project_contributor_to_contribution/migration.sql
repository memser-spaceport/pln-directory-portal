/*
  Warnings:

  - You are about to drop the `ProjectContributor` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[memberUid,projectUid]` on the table `ProjectContribution` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ProjectContributor" DROP CONSTRAINT "ProjectContributor_memberUid_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContributor" DROP CONSTRAINT "ProjectContributor_projectUid_fkey";

-- AlterTable
ALTER TABLE "ProjectContribution" ALTER COLUMN "currentProject" DROP NOT NULL,
ALTER COLUMN "startDate" DROP NOT NULL;

-- DropTable
DROP TABLE "ProjectContributor";

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContribution_memberUid_projectUid_key" ON "ProjectContribution"("memberUid", "projectUid");
