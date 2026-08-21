-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "blueskyHandler" TEXT,
ADD COLUMN     "crunchbaseHandler" TEXT,
ADD COLUMN     "dateFounded" INTEGER,
ADD COLUMN     "teamSize" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE';
