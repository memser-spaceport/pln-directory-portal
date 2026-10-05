-- AI Apps starter kit update broadcast (LAB-2721): one row per kit version already announced; the unique version is
-- the at-most-once guard across API instances.
-- Additive: one new table with its indexes; no existing table, column or migration changes.

-- CreateTable
CREATE TABLE "AiAppStarterKitAnnouncement" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppStarterKitAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAppStarterKitAnnouncement_version_key" ON "AiAppStarterKitAnnouncement"("version");
