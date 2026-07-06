-- Persist structured social overlap on path rows (LinkedIn experience/education).
ALTER TABLE "PathfinderPath" ADD COLUMN "socialOverlap" JSONB;
