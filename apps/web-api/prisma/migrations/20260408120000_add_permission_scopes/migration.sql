-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MemberPermission" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "scope" TEXT;

-- CreateIndex
CREATE INDEX "Article_scope_idx" ON "Article"("scope");
