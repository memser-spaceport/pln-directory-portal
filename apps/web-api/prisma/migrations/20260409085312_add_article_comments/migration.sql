-- CreateTable
CREATE TABLE "ArticleComment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "articleUid" TEXT NOT NULL,
    "parentUid" TEXT,
    "content" TEXT NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "authorUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleCommentLike" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "commentUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleComment_uid_key" ON "ArticleComment"("uid");
CREATE INDEX "ArticleComment_articleUid_idx" ON "ArticleComment"("articleUid");
CREATE INDEX "ArticleComment_parentUid_idx" ON "ArticleComment"("parentUid");
CREATE INDEX "ArticleComment_authorUid_idx" ON "ArticleComment"("authorUid");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleCommentLike_uid_key" ON "ArticleCommentLike"("uid");
CREATE UNIQUE INDEX "ArticleCommentLike_commentUid_memberUid_key" ON "ArticleCommentLike"("commentUid", "memberUid");
CREATE INDEX "ArticleCommentLike_commentUid_idx" ON "ArticleCommentLike"("commentUid");
CREATE INDEX "ArticleCommentLike_memberUid_idx" ON "ArticleCommentLike"("memberUid");

-- AddForeignKey
ALTER TABLE "ArticleComment"
ADD CONSTRAINT "ArticleComment_articleUid_fkey"
FOREIGN KEY ("articleUid") REFERENCES "Article"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleComment"
ADD CONSTRAINT "ArticleComment_parentUid_fkey"
FOREIGN KEY ("parentUid") REFERENCES "ArticleComment"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleComment"
ADD CONSTRAINT "ArticleComment_authorUid_fkey"
FOREIGN KEY ("authorUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleCommentLike"
ADD CONSTRAINT "ArticleCommentLike_commentUid_fkey"
FOREIGN KEY ("commentUid") REFERENCES "ArticleComment"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleCommentLike"
ADD CONSTRAINT "ArticleCommentLike_memberUid_fkey"
FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
