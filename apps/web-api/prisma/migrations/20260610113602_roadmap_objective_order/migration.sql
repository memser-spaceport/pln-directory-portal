/*
  Warnings:

  - A unique constraint covering the columns `[order]` on the table `RoadmapObjective` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RoadmapObjective" ADD COLUMN     "order" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapObjective_order_key" ON "RoadmapObjective"("order");
