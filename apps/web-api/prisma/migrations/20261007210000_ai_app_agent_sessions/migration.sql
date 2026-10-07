-- Agent-minted app sessions (LAB-2763).
-- mcpAuthorizationUid stores McpAuthorization.uid so LAB-2764 can end those sessions on revoke.
-- Browser rows stay isAgent = false and mcpAuthorizationUid null.

ALTER TABLE "AiAppSession" ADD COLUMN "isAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAppSession" ADD COLUMN "mcpAuthorizationUid" TEXT;

CREATE INDEX "AiAppSession_mcpAuthorizationUid_idx" ON "AiAppSession"("mcpAuthorizationUid");
