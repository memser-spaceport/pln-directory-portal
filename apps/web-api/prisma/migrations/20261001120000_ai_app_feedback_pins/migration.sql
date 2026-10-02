-- AI Apps feedback in context: the context a report was filed in, and the
-- elements it pinned as rows (shown on the live app to its creator and admins).

ALTER TABLE "AiAppFeedback" ADD COLUMN IF NOT EXISTS "context" JSONB;

CREATE TABLE IF NOT EXISTS "AiAppFeedbackPin" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "feedbackUid" TEXT NOT NULL,
  "n" INTEGER NOT NULL,
  "env" TEXT NOT NULL,
  "pagePath" TEXT NOT NULL,
  "pageQuery" TEXT,
  "selector" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "role" TEXT,
  "ariaLabel" TEXT,
  "component" TEXT,
  "source" TEXT,
  "rect" JSONB NOT NULL,
  "viewportW" INTEGER NOT NULL,
  "viewportH" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "cropUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAppFeedbackPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAppFeedbackPin_uid_key" ON "AiAppFeedbackPin"("uid");
CREATE INDEX IF NOT EXISTS "AiAppFeedbackPin_feedbackUid_idx" ON "AiAppFeedbackPin"("feedbackUid");

ALTER TABLE "AiAppFeedbackPin"
  ADD CONSTRAINT "AiAppFeedbackPin_feedbackUid_fkey"
  FOREIGN KEY ("feedbackUid") REFERENCES "AiAppFeedback"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
