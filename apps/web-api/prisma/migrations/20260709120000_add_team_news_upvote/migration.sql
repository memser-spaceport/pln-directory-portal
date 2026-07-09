-- CreateTable
CREATE TABLE "TeamNewsUpvote" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "newsItemUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamNewsUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsUpvote_uid_key" ON "TeamNewsUpvote"("uid");

-- CreateIndex
CREATE INDEX "TeamNewsUpvote_newsItemUid_idx" ON "TeamNewsUpvote"("newsItemUid");

-- CreateIndex
CREATE INDEX "TeamNewsUpvote_memberUid_idx" ON "TeamNewsUpvote"("memberUid");

-- CreateIndex
CREATE INDEX "TeamNewsUpvote_createdAt_idx" ON "TeamNewsUpvote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsUpvote_newsItemUid_memberUid_key" ON "TeamNewsUpvote"("newsItemUid", "memberUid");

-- AddForeignKey
ALTER TABLE "TeamNewsUpvote" ADD CONSTRAINT "TeamNewsUpvote_newsItemUid_fkey" FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNewsUpvote" ADD CONSTRAINT "TeamNewsUpvote_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
