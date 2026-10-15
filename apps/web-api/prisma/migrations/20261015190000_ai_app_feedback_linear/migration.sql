-- CreateEnum
CREATE TYPE "FeedbackLinearTargetState" AS ENUM ('INTAKE', 'COMPLETED', 'CANCELED');

-- AlterEnum
ALTER TYPE "FeedbackLinearStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "AiApp" ADD COLUMN     "linearProjectId" TEXT,
ADD COLUMN     "linearTargetSetAt" TIMESTAMP(3),
ADD COLUMN     "linearTeamId" TEXT;

-- AlterTable
ALTER TABLE "FeedbackLinearIssue" ADD COLUMN     "appliedState" "FeedbackLinearTargetState",
ADD COLUMN     "intakeStateId" TEXT,
ADD COLUMN     "pendingCommentId" TEXT,
ADD COLUMN     "pendingCommentUid" TEXT,
ADD COLUMN     "targetState" "FeedbackLinearTargetState" NOT NULL DEFAULT 'INTAKE',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

