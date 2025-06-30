-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "aggregatedPriority" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "PLEventLocation" ADD COLUMN     "aggregatedPriority" INTEGER DEFAULT 0;
