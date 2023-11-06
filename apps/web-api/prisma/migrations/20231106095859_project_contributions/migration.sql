/*
  Warnings:
  - Added the required column `type` to the `Faq` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maintainingTeamUid` to the `Project` table without a default value. This is not possible if the table is not empty.

*/

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_teamUid_fkey";

-- AlterTable
ALTER TABLE "Faq" ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "teamUid",
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maintainingTeamUid" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ProjectContribution" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "role" TEXT,
    "description" TEXT,
    "currentProject" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "memberUid" TEXT NOT NULL,
    "projectUid" TEXT NOT NULL,

    CONSTRAINT "ProjectContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_contributingTeams" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContribution_uid_key" ON "ProjectContribution"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "_contributingTeams_AB_unique" ON "_contributingTeams"("A", "B");

-- CreateIndex
CREATE INDEX "_contributingTeams_B_index" ON "_contributingTeams"("B");

-- AddForeignKey
ALTER TABLE "ProjectContribution" ADD CONSTRAINT "ProjectContribution_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContribution" ADD CONSTRAINT "ProjectContribution_projectUid_fkey" FOREIGN KEY ("projectUid") REFERENCES "Project"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_maintainingTeamUid_fkey" FOREIGN KEY ("maintainingTeamUid") REFERENCES "Team"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_contributingTeams" ADD CONSTRAINT "_contributingTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_contributingTeams" ADD CONSTRAINT "_contributingTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
