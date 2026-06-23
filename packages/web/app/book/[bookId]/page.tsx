import { notFound } from "next/navigation";
import { getBook } from "@/lib/api";
import { BookChaptersView } from "@/components/book-chapters-view";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = await getBook(bookId).catch(() => null);

  if (!book) {
    notFound();
  }

  return <BookChaptersView book={book} />;
}
