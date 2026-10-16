-- CreateEnum
CREATE TYPE "JobMatchEmailKind" AS ENUM ('FIRST', 'NEW', 'REMINDER');

-- AlterTable
ALTER TABLE "JobMatchEmailSend" ADD COLUMN     "kind" "JobMatchEmailKind" NOT NULL DEFAULT 'FIRST',
ADD COLUMN     "memberUids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "JobMatchEmailSend_roleUid_recipientUid_idx" ON "JobMatchEmailSend"("roleUid", "recipientUid");

