-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Chapter_bookId_orderIndex_idx" ON "Chapter"("bookId", "orderIndex");
