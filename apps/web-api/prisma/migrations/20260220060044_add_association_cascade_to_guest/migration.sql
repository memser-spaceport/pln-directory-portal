-- AlterTable
ALTER TABLE "PLEventGuest" ADD COLUMN     "associationUid" TEXT;

-- AddForeignKey
ALTER TABLE "PLEventGuest" ADD CONSTRAINT "PLEventGuest_associationUid_fkey" FOREIGN KEY ("associationUid") REFERENCES "PLEventAssociation"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
