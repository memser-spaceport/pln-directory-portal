-- One Warm Intros v2 refresh at a time. The partial unique index allows
-- a new RUNNING row only after the previous one leaves RUNNING.

CREATE TYPE "WarmIntrosV2RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TABLE "WarmIntrosV2Run" (
    "uid" TEXT NOT NULL,
    "status" "WarmIntrosV2RunStatus" NOT NULL DEFAULT 'RUNNING',
    "lockedUntil" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WarmIntrosV2Run_pkey" PRIMARY KEY ("uid")
);

CREATE INDEX "WarmIntrosV2Run_status_lockedUntil_idx" ON "WarmIntrosV2Run"("status", "lockedUntil");
CREATE INDEX "WarmIntrosV2Run_startedAt_idx" ON "WarmIntrosV2Run"("startedAt");
CREATE UNIQUE INDEX "WarmIntrosV2Run_one_running_idx" ON "WarmIntrosV2Run" ("status") WHERE "status" = 'RUNNING';
