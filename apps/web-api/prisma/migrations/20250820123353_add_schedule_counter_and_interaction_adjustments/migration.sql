-- 1) Enum for adjustment reasons
CREATE TYPE "CounterAdjustmentReason" AS ENUM ('NEGATIVE_FEEDBACK', 'CANCELLED', 'RESCHEDULED');

-- 2) Denormalized counter on Member
ALTER TABLE "Member"
  ADD COLUMN "scheduleMeetingCount" INTEGER NOT NULL DEFAULT 0;

-- 3) Adjustment table
CREATE TABLE "MemberInteractionAdjustment"
(
  "id"             SERIAL PRIMARY KEY,
  "uid"            TEXT                      NOT NULL,
  "interactionUid" TEXT                      NOT NULL,
  "reason"         "CounterAdjustmentReason" NOT NULL,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemberInteractionAdjustment_uid_key" UNIQUE ("uid"),
  CONSTRAINT "MemberInteractionAdjustment_interactionUid_fkey"
    FOREIGN KEY ("interactionUid") REFERENCES "MemberInteraction" ("uid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MemberInteractionAdjustment_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "Member" ("uid") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4) Prevent duplicate adjustments for the same interaction+reason
CREATE UNIQUE INDEX "MemberInteractionAdjustment_interaction_reason_unique"
  ON "MemberInteractionAdjustment" ("interactionUid", "reason");

-- 5) Optional helper index for lookups
CREATE INDEX "MemberInteraction_target_type_idx"
  ON "MemberInteraction" ("targetMemberUid", "type");

-- RenameIndex
ALTER INDEX "MemberInteractionAdjustment_interaction_reason_unique" RENAME TO "MemberInteractionAdjustment_interactionUid_reason_key";
