-- CreateEnum
CREATE TYPE "FollowEntityType" AS ENUM ('EVENT_LOCATION', 'EVENT', 'PROJECT');

-- CreateTable
CREATE TABLE "MemberFollow" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "followedEntityUid" TEXT NOT NULL,
    "followedEntityType" "FollowEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberFollow_uid_key" ON "MemberFollow"("uid");

-- CreateIndex
CREATE INDEX "MemberFollow_memberUid_followedEntityUid_followedEntityType_idx" ON "MemberFollow"("memberUid", "followedEntityUid", "followedEntityType");

-- AddForeignKey
ALTER TABLE "MemberFollow" ADD CONSTRAINT "MemberFollow_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
