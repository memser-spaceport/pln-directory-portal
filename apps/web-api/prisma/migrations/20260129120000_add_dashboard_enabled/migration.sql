-- AlterEnum
ALTER TYPE "DemoDayAdminScopeType" ADD VALUE 'DASHBOARD_WHITELIST';

-- AlterTable
ALTER TABLE "DemoDay" ADD COLUMN "dashboardEnabled" BOOLEAN NOT NULL DEFAULT false;
