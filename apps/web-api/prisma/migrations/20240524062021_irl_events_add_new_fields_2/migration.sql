-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "additionalInfo" JSONB,
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "shortDescription" TEXT;

-- AlterTable
ALTER TABLE "PLEventGuest" ADD COLUMN     "additionalInfo" JSONB,
ADD COLUMN     "topics" TEXT[];
