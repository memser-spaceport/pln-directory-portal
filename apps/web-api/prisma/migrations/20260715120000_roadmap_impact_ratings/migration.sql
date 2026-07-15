-- Author create-time impact (not a boost) + boost impact on pins; raise default pin budget.

ALTER TABLE "RoadmapItem" ADD COLUMN "authorImpact" INTEGER;
ALTER TABLE "RoadmapItem" ADD COLUMN "authorImpactReasoning" TEXT;

ALTER TABLE "RoadmapItemPin" ADD COLUMN "impact" INTEGER;

ALTER TABLE "RoadmapSettings" ALTER COLUMN "pinLimit" SET DEFAULT 10;
UPDATE "RoadmapSettings" SET "pinLimit" = 10 WHERE "id" = 1;
