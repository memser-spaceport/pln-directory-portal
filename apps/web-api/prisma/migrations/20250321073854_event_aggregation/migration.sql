-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "isAggregated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PLEventLocation" ADD COLUMN     "isAggregated" BOOLEAN NOT NULL DEFAULT false;
