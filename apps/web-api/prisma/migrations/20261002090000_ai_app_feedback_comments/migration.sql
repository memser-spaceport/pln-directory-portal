-- AI Apps feedback, phase 2: a flat conversation under each feedback item
-- (replies from its creator, admins and submitter; the agent's closing note).

DO $$ BEGIN
  CREATE TYPE "AiAppFeedbackCommentKind" AS ENUM ('REPLY', 'CLOSING_NOTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AiAppFeedbackComment" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "feedbackUid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "kind" "AiAppFeedbackCommentKind" NOT NULL DEFAULT 'REPLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAppFeedbackComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAppFeedbackComment_uid_key" ON "AiAppFeedbackComment"("uid");
CREATE INDEX IF NOT EXISTS "AiAppFeedbackComment_feedbackUid_createdAt_idx" ON "AiAppFeedbackComment"("feedbackUid", "createdAt");

ALTER TABLE "AiAppFeedbackComment"
  ADD CONSTRAINT "AiAppFeedbackComment_feedbackUid_fkey"
  FOREIGN KEY ("feedbackUid") REFERENCES "AiAppFeedback"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
