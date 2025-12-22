-- AlterTable
ALTER TABLE "DemoDay" ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum
ALTER TYPE "PushNotificationCategory" ADD VALUE 'DEMO_DAY_ANNOUNCEMENT';
