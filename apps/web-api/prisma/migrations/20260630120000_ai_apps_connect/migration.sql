-- AI Apps: replace the long-lived per-member deploy token with short-lived
-- "connect" sessions. The starter kit no longer ships a token; the member's AI
-- agent starts a connect session, the member approves it in LabOS, and we mint a
-- short-lived deploy token bound to that session.

-- New audit event types for connect attempts (added separately from use).
ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'CONNECT_APPROVED';
ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'CONNECT_DENIED';

-- Connect session status enum.
DO $$ BEGIN
  CREATE TYPE "AiAppConnectStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Connect session table.
CREATE TABLE IF NOT EXISTS "AiAppConnectSession" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "userCode" TEXT NOT NULL,
  "clientName" TEXT,
  "pollToken" TEXT NOT NULL,
  "status" "AiAppConnectStatus" NOT NULL DEFAULT 'PENDING',
  "memberUid" TEXT,
  "deployToken" TEXT,
  "deployTokenExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiAppConnectSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAppConnectSession_uid_key" ON "AiAppConnectSession"("uid");
CREATE UNIQUE INDEX IF NOT EXISTS "AiAppConnectSession_userCode_key" ON "AiAppConnectSession"("userCode");
CREATE UNIQUE INDEX IF NOT EXISTS "AiAppConnectSession_pollToken_key" ON "AiAppConnectSession"("pollToken");
CREATE UNIQUE INDEX IF NOT EXISTS "AiAppConnectSession_deployToken_key" ON "AiAppConnectSession"("deployToken");
CREATE INDEX IF NOT EXISTS "AiAppConnectSession_memberUid_idx" ON "AiAppConnectSession"("memberUid");
CREATE INDEX IF NOT EXISTS "AiAppConnectSession_status_idx" ON "AiAppConnectSession"("status");

-- Drop the obsolete long-lived deploy token table.
DROP TABLE IF EXISTS "AiAppToken";
