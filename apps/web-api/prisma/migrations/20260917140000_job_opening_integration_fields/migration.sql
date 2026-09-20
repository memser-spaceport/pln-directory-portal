-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "equityNote" TEXT,
ADD COLUMN     "integrationExternalId" TEXT,
ADD COLUMN     "payCurrency" TEXT,
ADD COLUMN     "payMax" INTEGER,
ADD COLUMN     "payMin" INTEGER,
ADD COLUMN     "payPeriod" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_integrationKeyUid_integrationExternalId_key" ON "JobOpening"("integrationKeyUid", "integrationExternalId");

