-- AlterTable
ALTER TABLE "TeamNewsItem" ADD COLUMN "postedByMemberUid" TEXT;

-- CreateIndex
CREATE INDEX "TeamNewsItem_postedByMemberUid_idx" ON "TeamNewsItem"("postedByMemberUid");
