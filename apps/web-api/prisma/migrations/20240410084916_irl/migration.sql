-- CreateTable
CREATE TABLE "PLEvent" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "eventsCount" INTEGER,
    "telegramId" TEXT,
    "logoUid" TEXT,
    "bannerUid" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "websiteURL" TEXT,
    "slugURL" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLEventGuest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "telegramId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberUid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "eventUid" TEXT NOT NULL,

    CONSTRAINT "PLEventGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PLEvent_uid_key" ON "PLEvent"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "PLEvent_slugURL_key" ON "PLEvent"("slugURL");

-- CreateIndex
CREATE UNIQUE INDEX "PLEventGuest_uid_key" ON "PLEventGuest"("uid");

-- AddForeignKey
ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEvent" ADD CONSTRAINT "PLEvent_bannerUid_fkey" FOREIGN KEY ("bannerUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEventGuest" ADD CONSTRAINT "PLEventGuest_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEventGuest" ADD CONSTRAINT "PLEventGuest_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEventGuest" ADD CONSTRAINT "PLEventGuest_eventUid_fkey" FOREIGN KEY ("eventUid") REFERENCES "PLEvent"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
