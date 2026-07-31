-- Forum posts/comments/likes must never be written to our DB — NodeBB owns
-- that data in its own DB. FeedComment and FeedForumPostLike were built
-- polymorphic (news item OR forum post); this migration drops the forum-post
-- side entirely and re-points both tables at TeamNewsItem via a real FK.
-- No data migration: this feature has not shipped to prod, nothing to carry
-- over.

-- DropForeignKey
ALTER TABLE "FeedComment" DROP CONSTRAINT "FeedComment_authorUid_fkey";
ALTER TABLE "FeedForumPostLike" DROP CONSTRAINT "FeedForumPostLike_memberUid_fkey";

-- DropTable
DROP TABLE "FeedComment";
DROP TABLE "FeedForumPostLike";

-- DropEnum
DROP TYPE "FeedItemType";

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "newsItemUid" TEXT NOT NULL,
    "parentUid" TEXT,
    "text" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedNewsLike" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "newsItemUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedNewsLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedComment_uid_key" ON "FeedComment"("uid");

-- CreateIndex
CREATE INDEX "FeedComment_newsItemUid_createdAt_idx" ON "FeedComment"("newsItemUid", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_parentUid_idx" ON "FeedComment"("parentUid");

-- CreateIndex
CREATE INDEX "FeedComment_authorUid_idx" ON "FeedComment"("authorUid");

-- CreateIndex
CREATE UNIQUE INDEX "FeedNewsLike_uid_key" ON "FeedNewsLike"("uid");

-- CreateIndex
CREATE INDEX "FeedNewsLike_newsItemUid_idx" ON "FeedNewsLike"("newsItemUid");

-- CreateIndex
CREATE INDEX "FeedNewsLike_memberUid_idx" ON "FeedNewsLike"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "FeedNewsLike_newsItemUid_memberUid_key" ON "FeedNewsLike"("newsItemUid", "memberUid");

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_newsItemUid_fkey" FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_parentUid_fkey" FOREIGN KEY ("parentUid") REFERENCES "FeedComment"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorUid_fkey" FOREIGN KEY ("authorUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNewsLike" ADD CONSTRAINT "FeedNewsLike_newsItemUid_fkey" FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNewsLike" ADD CONSTRAINT "FeedNewsLike_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
