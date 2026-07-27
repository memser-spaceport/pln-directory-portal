-- CreateEnum
CREATE TYPE "FeedItemType" AS ENUM ('NEWS', 'FORUM_POST');

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "itemType" "FeedItemType" NOT NULL,
    "itemUid" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedForumPostLike" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "forumPostUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedForumPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedComment_uid_key" ON "FeedComment"("uid");

-- CreateIndex
CREATE INDEX "FeedComment_itemType_itemUid_createdAt_idx" ON "FeedComment"("itemType", "itemUid", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_authorUid_idx" ON "FeedComment"("authorUid");

-- CreateIndex
CREATE UNIQUE INDEX "FeedForumPostLike_uid_key" ON "FeedForumPostLike"("uid");

-- CreateIndex
CREATE INDEX "FeedForumPostLike_forumPostUid_idx" ON "FeedForumPostLike"("forumPostUid");

-- CreateIndex
CREATE INDEX "FeedForumPostLike_memberUid_idx" ON "FeedForumPostLike"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "FeedForumPostLike_forumPostUid_memberUid_key" ON "FeedForumPostLike"("forumPostUid", "memberUid");

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorUid_fkey" FOREIGN KEY ("authorUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedForumPostLike" ADD CONSTRAINT "FeedForumPostLike_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
