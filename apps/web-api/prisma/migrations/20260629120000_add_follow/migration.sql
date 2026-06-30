-- CreateEnum
CREATE TYPE "FollowEntityType" AS ENUM ('TEAM', 'MEMBER');

-- CreateTable
CREATE TABLE "Follow" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "entityType" "FollowEntityType" NOT NULL DEFAULT 'TEAM',
    "entityUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Follow_uid_key" ON "Follow"("uid");

-- CreateIndex
CREATE INDEX "Follow_entityType_entityUid_idx" ON "Follow"("entityType", "entityUid");

-- CreateIndex
CREATE INDEX "Follow_memberUid_entityType_idx" ON "Follow"("memberUid", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_memberUid_entityType_entityUid_key" ON "Follow"("memberUid", "entityType", "entityUid");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
