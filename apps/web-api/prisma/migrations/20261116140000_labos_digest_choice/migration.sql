-- LAB-3263: More / Less like this choices from the digest page. Additive: a new enum and table.
-- CreateEnum
CREATE TYPE "LabosDigestChoiceKind" AS ENUM ('MORE', 'LESS');

-- CreateTable
CREATE TABLE "LabosDigestChoice" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "newsItemUid" TEXT NOT NULL,
    "choice" "LabosDigestChoiceKind" NOT NULL,
    "addedTags" TEXT[],
    "removedTags" TEXT[],
    "mutedAdded" TEXT[],
    "mutedRemoved" TEXT[],
    "beforeNewsTags" JSONB,
    "beforeMuted" JSONB,
    "afterNewsTags" JSONB NOT NULL,
    "afterMuted" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "LabosDigestChoice_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE INDEX "LabosDigestChoice_memberUid_newsItemUid_idx" ON "LabosDigestChoice"("memberUid", "newsItemUid");

-- CreateIndex
CREATE INDEX "LabosDigestChoice_newsItemUid_idx" ON "LabosDigestChoice"("newsItemUid");

-- AddForeignKey
ALTER TABLE "LabosDigestChoice" ADD CONSTRAINT "LabosDigestChoice_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabosDigestChoice" ADD CONSTRAINT "LabosDigestChoice_newsItemUid_fkey" FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active choice per member and story. Prisma cannot express a partial unique index, so it lives only here.
CREATE UNIQUE INDEX "LabosDigestChoice_active_member_story_key" ON "LabosDigestChoice"("memberUid", "newsItemUid") WHERE "undoneAt" IS NULL;
