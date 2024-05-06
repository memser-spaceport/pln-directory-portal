/*
  Warnings:

  - Added the required column `endDate` to the `PLEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `PLEvent` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PLEventType" AS ENUM ('INVITE_ONLY');

-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "resources" JSONB[],
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "type" "PLEventType",
ADD COLUMN     "location" TEXT NOT NULL;
