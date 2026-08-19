-- Warm Intros v2 — per-user path note (useful context, not correction feedback)
CREATE TABLE "WarmPathV2Note" (
    "uid" TEXT NOT NULL,
    "warmPathUid" TEXT NOT NULL,
    "targetProfileUid" TEXT NOT NULL,
    "targetSet" VARCHAR(120) NOT NULL,
    "connectorProfileUid" TEXT NOT NULL,
    "note" VARCHAR(600) NOT NULL,
    "actorUid" VARCHAR(64),
    "actorEmail" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarmPathV2Note_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "WarmPathV2Note_warmPathUid_connectorProfileUid_actorUid_key"
  ON "WarmPathV2Note"("warmPathUid", "connectorProfileUid", "actorUid");

CREATE INDEX "WarmPathV2Note_targetProfileUid_idx" ON "WarmPathV2Note"("targetProfileUid");
CREATE INDEX "WarmPathV2Note_warmPathUid_idx" ON "WarmPathV2Note"("warmPathUid");
CREATE INDEX "WarmPathV2Note_updatedAt_idx" ON "WarmPathV2Note"("updatedAt");
