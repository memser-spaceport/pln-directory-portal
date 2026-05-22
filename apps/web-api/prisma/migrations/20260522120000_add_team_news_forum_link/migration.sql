-- Authoritative link between TeamNewsItem and a forum (NodeBB) topic.
-- Populated by the home-page "Discuss" flow after a successful topic create.

CREATE TABLE "TeamNewsForumLink" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "newsItemUid" TEXT NOT NULL,
  "forumTopicId" INTEGER NOT NULL,
  "forumTopicSlug" TEXT NOT NULL,
  "forumTopicUrl" TEXT NOT NULL,
  "createdByUid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamNewsForumLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamNewsForumLink_uid_key" ON "TeamNewsForumLink"("uid");
CREATE UNIQUE INDEX "TeamNewsForumLink_newsItemUid_forumTopicId_key"
  ON "TeamNewsForumLink"("newsItemUid", "forumTopicId");
CREATE INDEX "TeamNewsForumLink_newsItemUid_idx" ON "TeamNewsForumLink"("newsItemUid");

ALTER TABLE "TeamNewsForumLink"
  ADD CONSTRAINT "TeamNewsForumLink_newsItemUid_fkey"
  FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid")
  ON DELETE CASCADE ON UPDATE CASCADE;
