-- AI Apps: free-text feedback left by PL Infra members on an app's detail page.
-- A member may submit multiple entries per app; the list is readable only by
-- the app's creator and directory admins (enforced in the service).

CREATE TABLE IF NOT EXISTS "AiAppFeedback" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "appUid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAppFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAppFeedback_uid_key" ON "AiAppFeedback"("uid");
CREATE INDEX IF NOT EXISTS "AiAppFeedback_appUid_idx" ON "AiAppFeedback"("appUid");
CREATE INDEX IF NOT EXISTS "AiAppFeedback_memberUid_idx" ON "AiAppFeedback"("memberUid");
