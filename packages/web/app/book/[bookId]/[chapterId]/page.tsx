import { ChapterReader } from "@/components/chapter-reader";
import { getBook, getChapter } from "@/lib/api";
import { parseBookmarkPosition } from "@/lib/reader-scroll";
import { notFound } from "next/navigation";

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
  searchParams: Promise<{ position?: string | string[] }>;
}) {
  const { bookId, chapterId } = await params;
  const { position } = await searchParams;
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
      key={chapter.id}
      book={book}
      chapter={chapter}
      previousChapter={previousChapter}
      nextChapter={nextChapter}
      initialBookmarkPosition={parseBookmarkPosition(position)}
    />
  );
}
