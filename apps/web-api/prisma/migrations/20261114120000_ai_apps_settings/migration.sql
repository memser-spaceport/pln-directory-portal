-- Per-app settings a directory admin sets in Back Office (LAB-3236). Every existing
-- app keeps its behaviour: no permission or member audience, listed under More,
-- no custom path or icon, LabOS top navigation shown.
ALTER TABLE "AiApp" ADD COLUMN "audiencePermissionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AiApp" ADD COLUMN "showInMore" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiApp" ADD COLUMN "path" TEXT;
ALTER TABLE "AiApp" ADD COLUMN "iconUrl" TEXT;
ALTER TABLE "AiApp" ADD COLUMN "hideTopNav" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "AiApp_path_key" ON "AiApp"("path");

-- Individual members an app is published to.
CREATE TABLE "AiAppAudienceMember" (
    "appUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "addedByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAppAudienceMember_pkey" PRIMARY KEY ("appUid","memberUid")
);

CREATE INDEX "AiAppAudienceMember_memberUid_idx" ON "AiAppAudienceMember"("memberUid");
