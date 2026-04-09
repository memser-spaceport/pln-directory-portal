-- Add new scopes array column
ALTER TABLE "Article" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate existing data: copy non-null scope into scopes array
UPDATE "Article" SET "scopes" = ARRAY["scope"] WHERE "scope" IS NOT NULL;

-- Drop old scope column
ALTER TABLE "Article" DROP COLUMN "scope";

-- Replace index
DROP INDEX IF EXISTS "Article_scope_idx";
CREATE INDEX "Article_scopes_idx" ON "Article"("scopes");
