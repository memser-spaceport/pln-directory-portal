-- CreateEnum
CREATE TYPE "MemberApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "MemberApproval" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "state" "MemberApprovalState" NOT NULL DEFAULT 'PENDING',
    "requestedByUid" TEXT,
    "reviewedByUid" TEXT,
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberApproval_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "MemberApprovalEvent" (
    "uid" TEXT NOT NULL,
    "approvalUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "fromState" "MemberApprovalState",
    "toState" "MemberApprovalState" NOT NULL,
    "actorUid" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberApprovalEvent_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberApproval_memberUid_key" ON "MemberApproval"("memberUid");
CREATE INDEX "MemberApproval_state_idx" ON "MemberApproval"("state");
CREATE INDEX "MemberApproval_requestedByUid_idx" ON "MemberApproval"("requestedByUid");
CREATE INDEX "MemberApproval_reviewedByUid_idx" ON "MemberApproval"("reviewedByUid");

CREATE INDEX "MemberApprovalEvent_approvalUid_idx" ON "MemberApprovalEvent"("approvalUid");
CREATE INDEX "MemberApprovalEvent_memberUid_idx" ON "MemberApprovalEvent"("memberUid");
CREATE INDEX "MemberApprovalEvent_actorUid_idx" ON "MemberApprovalEvent"("actorUid");

-- AddForeignKey
ALTER TABLE "MemberApproval"
ADD CONSTRAINT "MemberApproval_memberUid_fkey"
FOREIGN KEY ("memberUid") REFERENCES "Member"("uid")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberApproval"
ADD CONSTRAINT "MemberApproval_requestedByUid_fkey"
FOREIGN KEY ("requestedByUid") REFERENCES "Member"("uid")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemberApproval"
ADD CONSTRAINT "MemberApproval_reviewedByUid_fkey"
FOREIGN KEY ("reviewedByUid") REFERENCES "Member"("uid")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemberApprovalEvent"
ADD CONSTRAINT "MemberApprovalEvent_approvalUid_fkey"
FOREIGN KEY ("approvalUid") REFERENCES "MemberApproval"("uid")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberApprovalEvent"
ADD CONSTRAINT "MemberApprovalEvent_memberUid_fkey"
FOREIGN KEY ("memberUid") REFERENCES "Member"("uid")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberApprovalEvent"
ADD CONSTRAINT "MemberApprovalEvent_actorUid_fkey"
FOREIGN KEY ("actorUid") REFERENCES "Member"("uid")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from legacy accessLevel
INSERT INTO "MemberApproval" (
  "uid",
  "memberUid",
  "state",
  "reason",
  "requestedAt",
  "reviewedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('ma_', "uid"),
  "uid",
  CASE
    WHEN "accessLevel" IN ('L2', 'L3', 'L4') THEN 'APPROVED'::"MemberApprovalState"
    WHEN "accessLevel" = 'REJECTED' THEN 'REJECTED'::"MemberApprovalState"
    ELSE 'PENDING'::"MemberApprovalState"
  END,
  'Backfilled from legacy accessLevel',
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  CASE
    WHEN "accessLevel" IN ('L2', 'L3', 'L4', 'REJECTED') THEN COALESCE("accessLevelUpdatedAt", "updatedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "Member"
WHERE NOT EXISTS (
  SELECT 1
  FROM "MemberApproval" ma
  WHERE ma."memberUid" = "Member"."uid"
);
