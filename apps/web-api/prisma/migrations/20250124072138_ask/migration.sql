-- CreateTable
CREATE TABLE "Ask" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "teamUid" TEXT,
    "projectUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ask_uid_key" ON "Ask"("uid");

-- AddForeignKey
ALTER TABLE "Ask" ADD CONSTRAINT "Ask_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ask" ADD CONSTRAINT "Ask_projectUid_fkey" FOREIGN KEY ("projectUid") REFERENCES "Project"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
