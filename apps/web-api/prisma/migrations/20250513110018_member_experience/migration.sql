-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "linkedInDetails" JSONB;

-- CreateTable
CREATE TABLE "MemberExperience" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isFlaggedByUser" BOOLEAN NOT NULL DEFAULT false,
    "isModifiedByUser" BOOLEAN NOT NULL DEFAULT false,
    "userUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberUid" TEXT NOT NULL,

    CONSTRAINT "MemberExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberExperience_uid_key" ON "MemberExperience"("uid");

-- AddForeignKey
ALTER TABLE "MemberExperience" ADD CONSTRAINT "MemberExperience_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
