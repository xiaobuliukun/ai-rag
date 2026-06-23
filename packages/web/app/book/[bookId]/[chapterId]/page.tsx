import { ChapterReader } from "@/components/chapter-reader";
import { getBook, getChapter } from "@/lib/api";
import { notFound } from "next/navigation";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  const [book, chapter] = await Promise.all([
    getBook(bookId).catch(() => null),
    getChapter(bookId, chapterId).catch(() => null),
  ]);

  if (!book || !chapter) {
    notFound();
  }

  const chapters = book.chapters ?? [];
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1
      ? chapters[chapterIndex + 1]
      : null;

  return (
    <ChapterReader
      book={book}
      chapter={chapter}
      previousChapter={previousChapter}
      nextChapter={nextChapter}
    />
  );
}
