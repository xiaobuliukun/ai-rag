-- CreateVirtualTable
CREATE VIRTUAL TABLE "ChapterChunkFts" USING fts5(
    "chunkId" UNINDEXED,
    "bookId" UNINDEXED,
    "chapterId" UNINDEXED,
    "bookTitle" UNINDEXED,
    "chapterTitle" UNINDEXED,
    "searchText",
    tokenize = 'unicode61'
);
