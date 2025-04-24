-- AlterTable
ALTER TABLE "Ask" ADD COLUMN     "closedByUid" TEXT,
ADD COLUMN     "closedComment" TEXT;

-- AddForeignKey
ALTER TABLE "Ask" ADD CONSTRAINT "Ask_closedByUid_fkey" FOREIGN KEY ("closedByUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
