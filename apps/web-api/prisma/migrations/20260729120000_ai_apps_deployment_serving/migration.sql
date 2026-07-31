-- AI Apps deployment status: distinguish "latest deploy failed but a previous
-- version still serves" from "nothing ever shipped".
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "lastDeployedAt" TIMESTAMP(3);
ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "failureStream" TEXT;

-- Backfill lastDeployedAt from the append-only audit log: the newest
-- DEPLOY_SUCCEEDED event per app is exactly "when it last shipped". Without
-- this, every pre-existing ERROR app would read as "never deployed".
UPDATE "AiApp" a
SET "lastDeployedAt" = e."lastSuccess"
FROM (
  SELECT "appUid", MAX("createdAt") AS "lastSuccess"
  FROM "AiAppEvent"
  WHERE "type" = 'DEPLOY_SUCCEEDED' AND "appUid" IS NOT NULL
  GROUP BY "appUid"
) e
WHERE a."uid" = e."appUid" AND a."lastDeployedAt" IS NULL;

-- Belt and braces: a READY app has by definition shipped, even if its
-- DEPLOY_SUCCEEDED event predates the audit log. Approximate with updatedAt.
UPDATE "AiApp"
SET "lastDeployedAt" = "updatedAt"
WHERE "status" = 'READY' AND "lastDeployedAt" IS NULL;
