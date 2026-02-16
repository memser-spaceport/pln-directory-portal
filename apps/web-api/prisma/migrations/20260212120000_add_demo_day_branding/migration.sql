-- CreateTable
CREATE TABLE "DemoDayBranding" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "demoDayUid" TEXT NOT NULL,
    "logoUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDayBranding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayBranding_uid_key" ON "DemoDayBranding"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayBranding_demoDayUid_key" ON "DemoDayBranding"("demoDayUid");

-- AddForeignKey
ALTER TABLE "DemoDayBranding" ADD CONSTRAINT "DemoDayBranding_demoDayUid_fkey" FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayBranding" ADD CONSTRAINT "DemoDayBranding_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
