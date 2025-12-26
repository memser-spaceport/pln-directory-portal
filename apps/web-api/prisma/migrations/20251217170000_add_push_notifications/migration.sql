-- CreateEnum
CREATE TYPE "PushNotificationCategory" AS ENUM ('DEMO_DAY_LIKE', 'DEMO_DAY_CONNECT', 'DEMO_DAY_INVEST', 'DEMO_DAY_REFERRAL', 'DEMO_DAY_FEEDBACK', 'FORUM_POST', 'FORUM_REPLY', 'EVENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "PushNotification" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "category" "PushNotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "link" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "recipientUid" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushNotificationReadStatus" (
    "id" SERIAL NOT NULL,
    "notificationId" INTEGER NOT NULL,
    "memberUid" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushNotificationReadStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushNotification_uid_key" ON "PushNotification"("uid");

-- CreateIndex (for public notification queries: WHERE isPublic = true)
CREATE INDEX "PushNotification_isPublic_idx" ON "PushNotification"("isPublic");

-- CreateIndex (for private notification queries: WHERE recipientUid = ? AND isPublic = false AND isRead = ?)
CREATE INDEX "PushNotification_recipientUid_isPublic_isRead_idx" ON "PushNotification"("recipientUid", "isPublic", "isRead");

-- CreateIndex
CREATE INDEX "PushNotificationReadStatus_memberUid_idx" ON "PushNotificationReadStatus"("memberUid");

-- CreateIndex
CREATE INDEX "PushNotificationReadStatus_notificationId_idx" ON "PushNotificationReadStatus"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "PushNotificationReadStatus_notificationId_memberUid_key" ON "PushNotificationReadStatus"("notificationId", "memberUid");

-- AddForeignKey
ALTER TABLE "PushNotification" ADD CONSTRAINT "PushNotification_recipientUid_fkey" FOREIGN KEY ("recipientUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotificationReadStatus" ADD CONSTRAINT "PushNotificationReadStatus_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PushNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotificationReadStatus" ADD CONSTRAINT "PushNotificationReadStatus_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
