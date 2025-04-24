-- CreateEnum
CREATE TYPE "AskStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Ask" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "status" "AskStatus" NOT NULL DEFAULT 'OPEN';
