-- Warm Intros v2 — per-user path feedback (canRefer + free-text note)
CREATE TABLE "WarmPathV2Feedback" (
    "uid" TEXT NOT NULL,
    "warmPathUid" TEXT NOT NULL,
    "targetProfileUid" TEXT NOT NULL,
    "targetSet" VARCHAR(120) NOT NULL,
    "connectorProfileUid" TEXT NOT NULL,
    "canRefer" VARCHAR(8), 
    "note" VARCHAR(600),
    "actorUid" VARCHAR(64),
    "actorEmail" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarmPathV2Feedback_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "WarmPathV2Feedback_warmPathUid_connectorProfileUid_actorUid_key"
  ON "WarmPathV2Feedback"("warmPathUid", "connectorProfileUid", "actorUid");

CREATE INDEX "WarmPathV2Feedback_targetProfileUid_idx" ON "WarmPathV2Feedback"("targetProfileUid");
CREATE INDEX "WarmPathV2Feedback_warmPathUid_idx" ON "WarmPathV2Feedback"("warmPathUid");
CREATE INDEX "WarmPathV2Feedback_updatedAt_idx" ON "WarmPathV2Feedback"("updatedAt");
