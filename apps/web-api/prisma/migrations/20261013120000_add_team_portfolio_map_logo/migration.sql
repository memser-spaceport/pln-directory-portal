-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "portfolioMapLogoUid" TEXT;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_portfolioMapLogoUid_fkey" FOREIGN KEY ("portfolioMapLogoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
