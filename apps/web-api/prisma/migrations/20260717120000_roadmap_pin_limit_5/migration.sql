-- Product: boost budget default is 5 (not 10).

ALTER TABLE "RoadmapSettings" ALTER COLUMN "pinLimit" SET DEFAULT 5;
UPDATE "RoadmapSettings" SET "pinLimit" = 5 WHERE "id" = 1;
