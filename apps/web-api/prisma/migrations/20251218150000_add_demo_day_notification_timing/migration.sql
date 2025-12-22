-- AlterTable
-- 336 hours = 2 weeks before start, 48 hours = 2 days before end
ALTER TABLE "DemoDay" ADD COLUMN "notifyBeforeStartHours" INTEGER DEFAULT 336;
ALTER TABLE "DemoDay" ADD COLUMN "notifyBeforeEndHours" INTEGER DEFAULT 48;
