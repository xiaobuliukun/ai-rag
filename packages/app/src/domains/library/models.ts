import type { Book, Chapter, LibraryStats, SearchResult } from "@moxu/shared";

export type LibraryBook = Book;
export type LibraryChapter = Chapter;
export type LibraryOverview = LibraryStats;
export type LibrarySearchResult = SearchResult;

export function getBookProgress(book: Pick<Book, "chapters" | "totalChapters" | "readChapters">) {
  const total = book.totalChapters ?? book.chapters?.length ?? 0;
  const read =
    book.readChapters ?? book.chapters?.filter((chapter) => chapter.isRead).length ?? 0;

  return {
    total,
    read,
    percentage: total > 0 ? Math.round((read / total) * 100) : 0
  };
}

export function sortChapters(chapters: Chapter[] = []) {
  return [...chapters].sort(
    (left, right) =>
      left.orderIndex - right.orderIndex ||
      left.fileName.localeCompare(right.fileName, "zh-CN", { numeric: true })
  );
}
