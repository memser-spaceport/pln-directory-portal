-- Per-app access: OPEN (all PL Infra members) or PRIVATE (owner, directory
-- admins, and whitelisted members).
CREATE TYPE "AiAppAccess" AS ENUM ('OPEN', 'PRIVATE');

-- Existing apps were all visible to every PL Infra member, so they are
-- backfilled OPEN; apps created from now on default to PRIVATE.
ALTER TABLE "AiApp" ADD COLUMN "access" "AiAppAccess" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "AiApp" ALTER COLUMN "access" SET DEFAULT 'PRIVATE';

-- No existing app has shipped with the per-app auth sidecar yet.
ALTER TABLE "AiApp" ADD COLUMN "directLinkGateReady" BOOLEAN NOT NULL DEFAULT false;

-- Existing apps were already announced (or predate announcements), so they are
-- never broadcast again.
ALTER TABLE "AiApp" ADD COLUMN "announcedAt" TIMESTAMP(3);
UPDATE "AiApp" SET "announcedAt" = COALESCE("lastDeployedAt", "createdAt");

-- CreateTable
CREATE TABLE "AiAppAllowedMember" (
    "appUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "addedByUid" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppAllowedMember_pkey" PRIMARY KEY ("appUid","memberUid")
);

-- CreateIndex
CREATE INDEX "AiAppAllowedMember_memberUid_idx" ON "AiAppAllowedMember"("memberUid");
