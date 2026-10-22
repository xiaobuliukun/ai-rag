import * as React from "react";
import { createRoot } from "react-dom/client";
import { ClientLayout } from "@/components/client-layout";
import { ManagementView } from "@/components/management-view";
import { SearchView } from "@/components/search-view";
import { SettingsView } from "@/components/settings-view";
import { LibraryView } from "@/components/library-view";
import { BookChaptersView } from "@/components/book-chapters-view";
import { ChapterReader } from "@/components/chapter-reader";
import { ThemeProvider } from "@/components/theme-provider";
import type { Book, Chapter } from "@/types";
import { getBook, getChapter } from "@/lib/api";
import { parseBookmarkPosition } from "@/lib/reader-scroll";
import { readHashLocation, usePathname } from "./compat/next-navigation";

function DesktopApp() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ClientLayout>
        <DesktopRoute />
      </ClientLayout>
    </ThemeProvider>
  );
}

function DesktopRoute() {
  const pathname = usePathname();

  if (pathname === "/") {
    return <LibraryView />;
  }
  if (pathname === "/search") {
    return <SearchView initialQuery={readQuery("q")} />;
  }
  if (pathname === "/management") {
    return <ManagementView />;
  }
  if (pathname === "/settings") {
    return <SettingsView />;
  }

  const bookMatch = pathname.match(/^\/book\/([^/]+)(?:\/([^/]+))?$/);
  if (!bookMatch) {
    return <LibraryView />;
  }

  const [, bookId, chapterId] = bookMatch;
  return chapterId ? (
    <ChapterRoute bookId={bookId} chapterId={chapterId} />
  ) : (
    <BookRoute bookId={bookId} />
  );
}

function BookRoute({ bookId }: { bookId: string }) {
  const [book, setBook] = React.useState<Book | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setBook(null);
    setError(null);
    void getBook(bookId)
      .then((nextBook) => {
        if (!cancelled) setBook(nextBook);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "无法加载书籍");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (error) return <RouteError message={error} />;
  if (!book) return <RouteLoading />;
  return <BookChaptersView book={book} />;
}

function ChapterRoute({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const [data, setData] = React.useState<{
    book: Book;
    chapter: Chapter;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    void Promise.all([getBook(bookId), getChapter(bookId, chapterId)])
      .then(([book, chapter]) => {
        if (!cancelled) setData({ book, chapter });
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "无法加载章节");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterId]);

  if (error) return <RouteError message={error} />;
  if (!data) return <RouteLoading />;

  const chapters = data.book.chapters ?? [];
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
  return (
    <ChapterReader
      key={data.chapter.id}
      book={data.book}
      chapter={data.chapter}
      previousChapter={chapterIndex > 0 ? chapters[chapterIndex - 1] : null}
      nextChapter={
        chapterIndex >= 0 && chapterIndex < chapters.length - 1
          ? chapters[chapterIndex + 1]
          : null
      }
      initialBookmarkPosition={parseBookmarkPosition(readQuery("position"))}
    />
  );
}

function readQuery(name: string) {
  const location = readHashLocation();
  return new URLSearchParams(location.split("?", 2)[1] ?? "").get(name) ?? undefined;
}

function RouteLoading() {
  return <div className="state-panel rounded-lg border p-8 text-center">正在加载…</div>;
}

function RouteError({ message }: { message: string }) {
  return <div className="state-panel rounded-lg border p-8 text-center text-destructive">{message}</div>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
);
