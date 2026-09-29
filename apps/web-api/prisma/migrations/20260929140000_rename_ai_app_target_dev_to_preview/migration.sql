-- The second AI App target is preview, not dev. Fleet-level dev is unchanged.
ALTER TYPE "AiAppTargetEnvironment" RENAME VALUE 'dev' TO 'preview';

ALTER TABLE "AiApp" ADD COLUMN "previewAccess" "AiAppAccess" NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE "AiAppAllowedMember" ADD COLUMN "environment" "AiAppTargetEnvironment" NOT NULL DEFAULT 'prod';
ALTER TABLE "AiAppAllowedMember" DROP CONSTRAINT "AiAppAllowedMember_pkey";
ALTER TABLE "AiAppAllowedMember" ADD CONSTRAINT "AiAppAllowedMember_pkey" PRIMARY KEY ("appUid", "environment", "memberUid");
