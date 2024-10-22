-- AlterTable
ALTER TABLE "PLEventGuest" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" INTEGER;
