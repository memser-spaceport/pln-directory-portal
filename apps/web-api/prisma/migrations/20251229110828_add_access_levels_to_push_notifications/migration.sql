-- AlterTable
ALTER TABLE "DemoDay" ALTER COLUMN "host" SET DEFAULT 'plnetwork.io';

-- AlterTable
ALTER TABLE "PushNotification" ADD COLUMN     "accessLevels" TEXT[] DEFAULT ARRAY[]::TEXT[];
