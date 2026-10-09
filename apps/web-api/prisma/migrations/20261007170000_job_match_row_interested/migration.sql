-- LAB-2788: mark suggested candidates who said they are interested in the role or its team.
-- AlterTable
ALTER TABLE "JobMatchRow" ADD COLUMN     "interested" BOOLEAN NOT NULL DEFAULT false;

