/*
  Warnings:

  - You are about to drop the column `accepted` on the `InvestorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `acceptedAt` on the `InvestorProfile` table. All the data in the column will be lost.
  - The `typicalCheckSize` column on the `InvestorProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "InvestorProfile" DROP COLUMN "accepted",
DROP COLUMN "acceptedAt",
ADD COLUMN     "secRulesAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "secRulesAcceptedAt" TIMESTAMP(3),
DROP COLUMN "typicalCheckSize",
ADD COLUMN     "typicalCheckSize" DOUBLE PRECISION;
