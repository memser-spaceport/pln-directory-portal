-- CreateTable
CREATE TABLE "ArticleRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "articleUid" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedByUserUid" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRequest_uid_key" ON "ArticleRequest"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRequest_articleUid_requestedByUserUid_key"
ON "ArticleRequest"("articleUid", "requestedByUserUid");

-- CreateIndex
CREATE INDEX "ArticleRequest_articleUid_idx" ON "ArticleRequest"("articleUid");
CREATE INDEX "ArticleRequest_requestedByUserUid_idx" ON "ArticleRequest"("requestedByUserUid");
CREATE INDEX "ArticleRequest_requestedDate_idx" ON "ArticleRequest"("requestedDate");

-- AddForeignKey
ALTER TABLE "ArticleRequest"
ADD CONSTRAINT "ArticleRequest_articleUid_fkey"
FOREIGN KEY ("articleUid")
REFERENCES "Article"("uid")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRequest"
ADD CONSTRAINT "ArticleRequest_requestedByUserUid_fkey"
FOREIGN KEY ("requestedByUserUid")
REFERENCES "Member"("uid")
ON DELETE CASCADE
ON UPDATE CASCADE;
