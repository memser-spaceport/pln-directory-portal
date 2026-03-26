-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "slugURL" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" TEXT NOT NULL,
    "readingTime" INTEGER NOT NULL DEFAULT 0,
    "coverImageUid" TEXT,
    "authorMemberUid" TEXT,
    "authorTeamUid" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleStatistic" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "articleUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleStatistic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleWhitelist" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_uid_key" ON "Article"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slugURL_key" ON "Article"("slugURL");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_category_idx" ON "Article"("category");

-- CreateIndex
CREATE INDEX "Article_authorMemberUid_idx" ON "Article"("authorMemberUid");

-- CreateIndex
CREATE INDEX "Article_authorTeamUid_idx" ON "Article"("authorTeamUid");

-- CreateIndex
CREATE INDEX "Article_isDeleted_idx" ON "Article"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleStatistic_uid_key" ON "ArticleStatistic"("uid");

-- CreateIndex
CREATE INDEX "ArticleStatistic_articleUid_idx" ON "ArticleStatistic"("articleUid");

-- CreateIndex
CREATE INDEX "ArticleStatistic_memberUid_idx" ON "ArticleStatistic"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleStatistic_articleUid_memberUid_key" ON "ArticleStatistic"("articleUid", "memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleWhitelist_uid_key" ON "ArticleWhitelist"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleWhitelist_memberUid_key" ON "ArticleWhitelist"("memberUid");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_coverImageUid_fkey" FOREIGN KEY ("coverImageUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorMemberUid_fkey" FOREIGN KEY ("authorMemberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorTeamUid_fkey" FOREIGN KEY ("authorTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleStatistic" ADD CONSTRAINT "ArticleStatistic_articleUid_fkey" FOREIGN KEY ("articleUid") REFERENCES "Article"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleStatistic" ADD CONSTRAINT "ArticleStatistic_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleWhitelist" ADD CONSTRAINT "ArticleWhitelist_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
