/*
  Warnings:

  - Changed the type of `type` on the `ProjectContributor` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ProjectContributorType" AS ENUM ('MAINTENER', 'COLLABORATOR');

-- AlterTable
ALTER TABLE "ProjectContributor" DROP COLUMN "type",
ADD COLUMN     "type" "ProjectContributorType" NOT NULL;
