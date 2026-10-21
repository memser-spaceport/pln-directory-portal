-- AlterTable
ALTER TABLE "McpAuthorization" ADD COLUMN     "canWrite" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AiAppSession" ADD COLUMN     "agentAccess" TEXT;
