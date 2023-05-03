/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "openForWork" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "MemberRole" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MemberToMemberRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberRole_uid_key" ON "MemberRole"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRole_name_key" ON "MemberRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_MemberToMemberRole_AB_unique" ON "_MemberToMemberRole"("A", "B");

-- CreateIndex
CREATE INDEX "_MemberToMemberRole_B_index" ON "_MemberToMemberRole"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Member_externalId_key" ON "Member"("externalId");

-- AddForeignKey
ALTER TABLE "_MemberToMemberRole" ADD CONSTRAINT "_MemberToMemberRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberToMemberRole" ADD CONSTRAINT "_MemberToMemberRole_B_fkey" FOREIGN KEY ("B") REFERENCES "MemberRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
