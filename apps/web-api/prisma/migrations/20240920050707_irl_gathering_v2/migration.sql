/*
  Warnings:

  - You are about to drop the column `location` on the `PLEvent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PLEvent" DROP COLUMN "location",
ADD COLUMN     "locationUid" TEXT;

-- AlterTable
ALTER TABLE "PLEventGuest" ADD COLUMN     "isHost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSpeaker" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PLEventLocation" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" TEXT,
    "longitude" TEXT,
    "flag" TEXT,
    "icon" TEXT,
    "resources" JSONB[],
    "additionalInfo" JSONB,
    "priority" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLEventLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PLEventLocation_uid_key" ON "PLEventLocation"("uid");

-- AddForeignKey
ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_locationUid_fkey" FOREIGN KEY ("locationUid") REFERENCES "PLEventLocation"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
