-- LabOS MCP connect: mcp.connect permission (Directory admins only) plus
-- OAuth client / authorization / auth-code tables.

BEGIN;

WITH seed(uid, code, module, description) AS (
  VALUES
    (
      'mcp.connect',
      'mcp.connect',
      'MCP',
      'Authorize an AI agent to access LabOS as this member via MCP'
    )
)
INSERT INTO "Permission" ("uid", "code", "module", "description", "createdAt", "updatedAt")
SELECT s.uid, s.code, s.module, s.description, NOW(), NOW()
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" p WHERE p."code" = s.code
);

WITH mappings(policy_code, permission_code) AS (
  VALUES
    ('directory_admin_pl_internal', 'mcp.connect')
)
INSERT INTO "PolicyPermission" ("uid", "policyUid", "permissionUid", "createdAt")
SELECT
  'pp_' || md5(p."uid" || ':' || perm."uid"),
  p."uid",
  perm."uid",
  NOW()
FROM mappings m
       JOIN "Policy" p ON p."code" = m.policy_code
       JOIN "Permission" perm ON perm."code" = m.permission_code
WHERE NOT EXISTS (
  SELECT 1
  FROM "PolicyPermission" pp
  WHERE pp."policyUid" = p."uid"
    AND pp."permissionUid" = perm."uid"
);

CREATE TABLE "McpOAuthClient" (
  "clientId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "redirectUris" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("clientId")
);

CREATE TABLE "McpAuthorization" (
  "uid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "accessTokenHash" TEXT,
  "refreshTokenHash" TEXT,
  "accessExpiresAt" TIMESTAMP(3),
  CONSTRAINT "McpAuthorization_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "McpAuthorization_accessTokenHash_key" ON "McpAuthorization"("accessTokenHash");
CREATE UNIQUE INDEX "McpAuthorization_refreshTokenHash_key" ON "McpAuthorization"("refreshTokenHash");
CREATE UNIQUE INDEX "McpAuthorization_memberUid_clientId_key" ON "McpAuthorization"("memberUid", "clientId");
CREATE INDEX "McpAuthorization_memberUid_revokedAt_idx" ON "McpAuthorization"("memberUid", "revokedAt");

ALTER TABLE "McpAuthorization"
  ADD CONSTRAINT "McpAuthorization_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "McpAuthCode" (
  "uid" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "resource" TEXT,
  "memberUid" TEXT NOT NULL,
  "authorizationUid" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "McpAuthCode_codeHash_key" ON "McpAuthCode"("codeHash");
CREATE INDEX "McpAuthCode_expiresAt_idx" ON "McpAuthCode"("expiresAt");

ALTER TABLE "McpAuthCode"
  ADD CONSTRAINT "McpAuthCode_authorizationUid_fkey"
  FOREIGN KEY ("authorizationUid") REFERENCES "McpAuthorization"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
