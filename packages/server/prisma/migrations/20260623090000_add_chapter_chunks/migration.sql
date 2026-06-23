-- CreateTable
CREATE TABLE "ChapterChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterChunk_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterChunk_chapterId_chunkIndex_key" ON "ChapterChunk"("chapterId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ChapterChunk_chapterId_idx" ON "ChapterChunk"("chapterId");
