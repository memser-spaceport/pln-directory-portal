-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionEntityType" AS ENUM ('EVENT_LOCATION');

-- CreateTable
CREATE TABLE "MemberSubscription" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "entityUid" TEXT NOT NULL,
    "entityAction" TEXT NOT NULL,
    "entityType" "SubscriptionEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MemberSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "entityUid" TEXT NOT NULL,
    "entityAction" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberSubscription_uid_key" ON "MemberSubscription"("uid");

-- CreateIndex
CREATE INDEX "MemberSubscription_memberUid_entityUid_entityType_idx" ON "MemberSubscription"("memberUid", "entityUid", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_uid_key" ON "Notification"("uid");

-- AddForeignKey
ALTER TABLE "MemberSubscription" ADD CONSTRAINT "MemberSubscription_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
