-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "workMode" TEXT;

-- CreateIndex
CREATE INDEX "JobOpening_workMode_idx" ON "JobOpening"("workMode");
