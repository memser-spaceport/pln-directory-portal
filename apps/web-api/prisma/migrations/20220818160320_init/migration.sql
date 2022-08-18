-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "github_handler" TEXT NOT NULL,
    "discord_handler" TEXT NOT NULL,
    "twitter" TEXT NOT NULL,
    "office_hours" TEXT NOT NULL,
    "pln_friend" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");
