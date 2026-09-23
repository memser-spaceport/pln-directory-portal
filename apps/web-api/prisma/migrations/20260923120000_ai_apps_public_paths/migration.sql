-- Per-app public path patterns the auth sidecar serves without LabOS auth.
-- Existing apps get none, so nothing becomes public.
ALTER TABLE "AiApp" ADD COLUMN "publicPaths" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- No existing app has shipped with a sidecar that forwards the request path.
ALTER TABLE "AiApp" ADD COLUMN "publicPathsGateReady" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum
ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'PUBLIC_PATHS_UPDATED';
