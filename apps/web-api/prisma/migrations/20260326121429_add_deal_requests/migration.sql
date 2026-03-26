-- CreateTable
CREATE TABLE "DealRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "dealUid" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedByUserUid" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealRequest_uid_key" ON "DealRequest"("uid");
CREATE UNIQUE INDEX "DealRequest_dealUid_requestedByUserUid_key" ON "DealRequest"("dealUid", "requestedByUserUid");
CREATE INDEX "DealRequest_dealUid_idx" ON "DealRequest"("dealUid");
CREATE INDEX "DealRequest_requestedByUserUid_idx" ON "DealRequest"("requestedByUserUid");
CREATE INDEX "DealRequest_requestedDate_idx" ON "DealRequest"("requestedDate");

-- AddForeignKey
ALTER TABLE "DealRequest"
  ADD CONSTRAINT "DealRequest_dealUid_fkey"
  FOREIGN KEY ("dealUid") REFERENCES "Deal"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRequest" ADD CONSTRAINT "DealRequest_requestedByUserUid_fkey" FOREIGN KEY ("requestedByUserUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

