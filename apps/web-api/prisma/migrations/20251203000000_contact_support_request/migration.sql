-- CreateTable
CREATE TABLE "ContactSupportRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactSupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactSupportRequest_uid_key" ON "ContactSupportRequest"("uid");
