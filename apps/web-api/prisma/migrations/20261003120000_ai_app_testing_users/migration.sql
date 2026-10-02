-- AI Apps Preview testing users (LAB-2743): name-only identities per app, kept until revoked.
-- Additive: one new table with its indexes; no existing table, column or migration changes.

-- CreateTable
CREATE TABLE "AiAppTestingUser" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "appUid" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppTestingUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAppTestingUser_uid_key" ON "AiAppTestingUser"("uid");

-- CreateIndex
CREATE INDEX "AiAppTestingUser_appUid_idx" ON "AiAppTestingUser"("appUid");

-- CreateIndex
CREATE UNIQUE INDEX "AiAppTestingUser_appUid_number_key" ON "AiAppTestingUser"("appUid", "number");

