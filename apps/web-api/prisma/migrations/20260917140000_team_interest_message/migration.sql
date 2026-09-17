-- What a member wrote when expressing interest in a team. Optional: interest
-- marked before this column existed simply has none.

-- AlterTable
ALTER TABLE "TeamInterest" ADD COLUMN     "message" TEXT;
