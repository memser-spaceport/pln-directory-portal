-- CreateEnum
CREATE TYPE "DiscoveryQuestionType" AS ENUM ('CHAT');

-- AlterTable
ALTER TABLE "DiscoveryQuestion" ADD COLUMN     "type" "DiscoveryQuestionType";
