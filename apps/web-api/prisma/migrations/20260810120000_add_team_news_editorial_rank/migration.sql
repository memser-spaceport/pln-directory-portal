-- AlterTable
ALTER TABLE "TeamNewsItem" ADD COLUMN "editorialRank" INTEGER;

-- CreateIndex
CREATE INDEX "TeamNewsItem_editorialRank_idx" ON "TeamNewsItem"("editorialRank");
