-- What a member wrote when marking interest in a job. Optional: interest
-- marked before this column existed simply has none.

-- AlterTable
ALTER TABLE "JobOpeningInterest" ADD COLUMN "note" TEXT;
