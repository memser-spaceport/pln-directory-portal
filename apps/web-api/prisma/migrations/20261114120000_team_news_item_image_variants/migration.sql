-- LAB-3135: link a team news item to our resized copy of its og:image. Additive: a nullable column and a foreign key.
-- AlterTable
ALTER TABLE "TeamNewsItem" ADD COLUMN     "imageUid" TEXT;

-- AddForeignKey
ALTER TABLE "TeamNewsItem" ADD CONSTRAINT "TeamNewsItem_imageUid_fkey" FOREIGN KEY ("imageUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
