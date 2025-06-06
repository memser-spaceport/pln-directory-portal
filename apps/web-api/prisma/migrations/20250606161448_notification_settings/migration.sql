-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" SERIAL NOT NULL,
    "memberUid" TEXT NOT NULL,
    "recommendationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "showInvitationDialog" BOOLEAN NOT NULL DEFAULT true,
    "emailFrequency" INTEGER NOT NULL DEFAULT 14,
    "byFocusArea" BOOLEAN NOT NULL DEFAULT true,
    "byRole" BOOLEAN NOT NULL DEFAULT true,
    "byFundingStage" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_memberUid_key" ON "NotificationSetting"("memberUid");

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
