-- AlterTable
ALTER TABLE "TeamPitch" ADD COLUMN "spotlightFrequency" TEXT NOT NULL DEFAULT 'month';
ALTER TABLE "TeamPitch" ADD COLUMN "spotlightStatement" TEXT;
