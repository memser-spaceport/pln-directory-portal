-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "updatedBy" TEXT;

-- CreateIndex
CREATE INDEX "Article_createdBy_idx" ON "Article"("createdBy");

-- CreateIndex
CREATE INDEX "Article_updatedBy_idx" ON "Article"("updatedBy");
