-- Suggested candidates (LAB-2770). One run row per UTC day, plus one row table
-- for resume state, criteria cache, and stored top-5 suggestions.

-- CreateEnum
CREATE TYPE "JobMatchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobMatchKind" AS ENUM ('TEAM', 'ROLE', 'SCORE', 'CRITERIA', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "JobMatchLabel" AS ENUM ('STRONG', 'GOOD');

-- CreateTable
CREATE TABLE "JobMatchRun" (
    "uid" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" "JobMatchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "lockedUntil" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobMatchRun_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "JobMatchRow" (
    "uid" TEXT NOT NULL,
    "runUid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL DEFAULT '',
    "roleUid" TEXT NOT NULL DEFAULT '',
    "memberUid" TEXT NOT NULL DEFAULT '',
    "roleTextHash" TEXT NOT NULL DEFAULT '',
    "kind" "JobMatchKind" NOT NULL,
    "rank" INTEGER,
    "fit" INTEGER,
    "label" "JobMatchLabel",
    "blurb" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatchRow_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchRun_runDate_key" ON "JobMatchRun"("runDate");

-- CreateIndex
CREATE INDEX "JobMatchRow_runUid_teamUid_kind_idx" ON "JobMatchRow"("runUid", "teamUid", "kind");

-- CreateIndex
CREATE INDEX "JobMatchRow_kind_roleUid_createdAt_idx" ON "JobMatchRow"("kind", "roleUid", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatchRow_kind_roleUid_roleTextHash_idx" ON "JobMatchRow"("kind", "roleUid", "roleTextHash");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchRow_kind_runUid_teamUid_roleUid_memberUid_roleTextHash_key" ON "JobMatchRow"("kind", "runUid", "teamUid", "roleUid", "memberUid", "roleTextHash");

-- AddForeignKey
ALTER TABLE "JobMatchRow" ADD CONSTRAINT "JobMatchRow_runUid_fkey" FOREIGN KEY ("runUid") REFERENCES "JobMatchRun"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
