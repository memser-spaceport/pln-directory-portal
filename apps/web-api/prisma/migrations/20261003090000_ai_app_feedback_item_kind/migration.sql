-- AI Apps feedback: an item is FEEDBACK (the written form, private to the app's
-- creator and admins) or COMMENT (pinned in the live app, public to its viewers).
-- Every existing row stays FEEDBACK: it was left under the "only the author and
-- admins see it" promise. Authors can now edit comments and replies (editedAt).

DO $$ BEGIN
  CREATE TYPE "AiAppFeedbackItemKind" AS ENUM ('FEEDBACK', 'COMMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AiAppFeedback" ADD COLUMN IF NOT EXISTS "kind" "AiAppFeedbackItemKind" NOT NULL DEFAULT 'FEEDBACK';
ALTER TABLE "AiAppFeedback" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "AiAppFeedbackComment" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AiAppFeedback_appUid_kind_idx" ON "AiAppFeedback"("appUid", "kind");
