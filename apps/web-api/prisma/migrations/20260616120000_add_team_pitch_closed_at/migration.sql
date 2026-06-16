ALTER TABLE "TeamPitch" ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "TeamPitch" SET "closedAt" = "updatedAt" WHERE "status" = 'CLOSED';
