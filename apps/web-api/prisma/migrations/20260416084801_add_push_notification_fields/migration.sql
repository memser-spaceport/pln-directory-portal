-- AlterEnum
ALTER TYPE "PushNotificationCategory" ADD VALUE 'NEW_FEATURE';

-- AlterTable
ALTER TABLE "PushNotification" ADD COLUMN     "linkText" TEXT,
ADD COLUMN     "requiredPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
