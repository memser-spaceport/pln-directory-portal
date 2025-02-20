-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);
