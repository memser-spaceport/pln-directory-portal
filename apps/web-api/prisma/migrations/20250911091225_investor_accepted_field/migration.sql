-- AlterTable
ALTER TABLE "InvestorProfile" ADD COLUMN     "accepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedAt" TIMESTAMP(3);
