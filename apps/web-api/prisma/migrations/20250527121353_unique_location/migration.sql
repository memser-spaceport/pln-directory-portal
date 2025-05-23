/*
  Warnings:

  - A unique constraint covering the columns `[latitude]` on the table `PLEventLocation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[longitude]` on the table `PLEventLocation` will be added. If there are existing duplicate values, this will fail.
  - Made the column `latitude` on table `PLEventLocation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `longitude` on table `PLEventLocation` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "PLEventLocation" ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PLEventLocation_latitude_key" ON "PLEventLocation"("latitude");

-- CreateIndex
CREATE UNIQUE INDEX "PLEventLocation_longitude_key" ON "PLEventLocation"("longitude");
