-- CreateEnum
CREATE TYPE "PLEventLocationStatus" AS ENUM ('AUTO_MAPPED', 'MANUALLY_MAPPED');

-- DropIndex
DROP INDEX "PLEventLocation_latitude_longitude_key";

-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "locationStatus" "PLEventLocationStatus",
ADD COLUMN     "reviewerUid" TEXT,
ADD COLUMN     "pLEventLocationAssociationUid" TEXT;

-- AlterTable
ALTER TABLE "PLEventLocation" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PLEventLocationAssociation" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "locationUid" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PLEventLocationAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PLEventLocationAssociation_uid_key" ON "PLEventLocationAssociation"("uid");

-- AddForeignKey
ALTER TABLE "PLEventLocationAssociation" ADD CONSTRAINT "PLEventLocationAssociation_locationUid_fkey" FOREIGN KEY ("locationUid") REFERENCES "PLEventLocation"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_reviewerUid_fkey" FOREIGN KEY ("reviewerUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Event -> Association
ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_pLEventLocationAssociationUid_fkey" FOREIGN KEY ("pLEventLocationAssociationUid") REFERENCES "PLEventLocationAssociation"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
