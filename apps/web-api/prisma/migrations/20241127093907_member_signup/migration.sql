/*
  Warnings:

  - A unique constraint covering the columns `[memberUid,teamUid,eventUid]` on the table `PLEventGuest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Member" 
ADD COLUMN  "isVerified" BOOLEAN DEFAULT false,
ADD COLUMN  "signUpSource" TEXT,
ADD COLUMN  "isSubscribedToNewsletter" BOOLEAN DEFAULT false,
ADD COLUMN  "isUserConsent" BOOLEAN DEFAULT false,
ADD COLUMN  "teamOrProjectURL" TEXT;
ALTER COLUMN "plnFriend" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PLEventGuest_memberUid_teamUid_eventUid_key" ON "PLEventGuest"("memberUid", "teamUid", "eventUid");


