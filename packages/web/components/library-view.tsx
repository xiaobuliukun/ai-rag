"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  FileText,
  FolderSearch,
  Loader2,
  Search,
  RefreshCw,
  TextSearch,
} from "lucide-react";
import { Book, LibraryStats, ScanJobStatus, SearchResult } from "@/types";
import { BookCard } from "@/components/book-card";
import { cn } from "@/lib/utils";
import {
  getBooks,
  getLibraryStats,
  cancelScanJob,
  searchLibrary,
  startScanJob,
  waitForScanJob,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const LIBRARY_REFRESH_EVENT = "library:refresh";

export function LibraryView() {
  const { t } = useI18n();
  const [books, setBooks] = React.useState<Book[]>([]);
  const [stats, setStats] = React.useState<LibraryStats | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [scanPath, setScanPath] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [scanJob, setScanJob] = React.useState<ScanJobStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);

  const loadBooks = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextBooks, nextStats] = await Promise.all([
        getBooks(),
        getLibraryStats().catch(() => null),
      ]);
      setBooks(nextBooks);
      setStats(nextStats);
    } catch (err) {
      setBooks([]);
      setStats(null);
      setError(err instanceof Error ? err.message : t("library.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    loadBooks();

    window.addEventListener(LIBRARY_REFRESH_EVENT, loadBooks);
    return () => window.removeEventListener(LIBRARY_REFRESH_EVENT, loadBooks);
  }, [loadBooks]);

  React.useEffect(() => {
    const keyword = query.trim();

    if (!keyword) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchLibrary(keyword);
        if (!isCancelled) {
          setSearchResults(results);
        }
      } catch (err) {
        if (!isCancelled) {
          setSearchResults([]);
          setSearchError(err instanceof Error ? err.message : t("search.failed"));
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, t]);

  const handleScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const path = scanPath.trim();
    if (!path) {
      setStatus(null);
      setError(t("library.pathRequired"));
      return;
    }

    setIsScanning(true);
    setStatus(null);
    setError(null);

    try {
      const { job } = await startScanJob(path);
      setScanJob(job);
      const completedJob = await waitForScanJob(job.id, setScanJob);
      if (completedJob.phase === "failed") {
        throw new Error(completedJob.error ?? completedJob.message);
      }
      setStatus(completedJob.message);
      await loadBooks();
      window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.scanFailed"));
    } finally {
      setIsScanning(false);
    }
  };

  const displayedReadingMinutes = stats
    ? stats.readingMinutes > 0
      ? stats.readingMinutes
      : stats.estimatedReadingMinutes
    : 0;
  const hasSearchQuery = query.trim().length > 0;
  const completionPercent =
    stats && stats.totalChapters > 0
      ? Math.round((stats.completedChapters / stats.totalChapters) * 100)
      : 0;
  const activeBooks = books.filter((book) => (book.readChapters ?? 0) > 0).length;
  const latestReadDate = stats?.latestReadAt
    ? new Date(stats.latestReadAt).toLocaleDateString()
    : t("book.notStarted");
  const featuredBook =
    books.find(
      (book) =>
        (book.readChapters ??
          book.chapters?.filter((chapter) => chapter.isRead).length ??
          0) > 0,
    ) ??
    books[0] ??
    null;
  const featuredTotalChapters = featuredBook
    ? featuredBook.totalChapters ?? featuredBook.chapters?.length ?? 0
    : 0;
  const featuredReadChapters = featuredBook
    ? featuredBook.readChapters ??
      featuredBook.chapters?.filter((chapter) => chapter.isRead).length ??
      0
    : 0;
  const featuredProgress =
    featuredTotalChapters > 0
      ? Math.round((featuredReadChapters / featuredTotalChapters) * 100)
      : 0;

  return (
    <div className="studio-stage grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <section className="studio-board shrink-0 overflow-hidden rounded-lg border px-4 py-3 lg:px-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-sm border bg-card/78 px-3 py-1 text-xs font-semibold text-primary">
                    <BookOpen className="h-3.5 w-3.5" />
                    {t("library.brand")}
                  </span>
                  <span className="rounded-sm border bg-background/54 px-3 py-1 text-xs font-medium text-muted-foreground">
                    {t("library.localArchive")}
                  </span>
                  <span className="rounded-sm border bg-background/54 px-3 py-1 text-xs font-medium text-muted-foreground">
                    {t("library.latestRead", { date: latestReadDate })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                  <h1 className="text-2xl font-semibold leading-none tracking-normal text-foreground md:text-3xl">
                    {t("library.readingArchive")}
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {books.length > 0
                      ? t("library.summary", {
                          books: books.length,
                          chapters: stats?.totalChapters ?? 0,
                        })
                      : t("library.emptyHint")}
                  </p>
                </div>
              </div>
              <div className="studio-completion shrink-0 rounded-md border bg-card/72 px-3 py-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("library.totalCompletion")}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-none text-foreground">
                  {completionPercent}%
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("library.searchPlaceholder")}
                  className="studio-input h-10 w-full rounded-md border bg-card/80 pl-11 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <form
                onSubmit={handleScan}
                className="studio-scan-form grid gap-2 rounded-md border bg-card/70 p-1 sm:grid-cols-[minmax(13rem,1fr)_auto]"
              >
                <div className="relative min-w-0">
                  <FolderSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={scanPath}
                    onChange={(event) => setScanPath(event.target.value)}
                    placeholder={t("library.scanPlaceholder")}
                    className="h-8 w-full min-w-0 rounded-md bg-transparent pl-10 pr-3 text-sm outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isScanning}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isScanning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>{isScanning ? t("library.scanning") : t("library.scan")}</span>
                </button>
              </form>
            </div>
          </div>

          <aside className="studio-focus-panel flex min-h-[7.5rem] flex-col justify-between rounded-md border p-3">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                {t("library.continueReading")}
              </div>
              {featuredBook ? (
                <>
                  <h2 className="mt-1.5 line-clamp-1 text-base font-semibold leading-snug text-foreground">
                    {featuredBook.title}
                  </h2>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {featuredBook.lastRead
                        ? new Date(featuredBook.lastRead).toLocaleDateString()
                        : t("book.notStarted")}
                    </span>
                    <span>
                      {t("book.chapterCount", {
                        read: featuredReadChapters,
                        total: featuredTotalChapters,
                      })}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${featuredProgress}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t("library.scanThenContinue")}
                </p>
              )}
            </div>
            {featuredBook && (
              <Link
                href={`/book/${featuredBook.id}`}
                className="studio-continue-link mt-3 inline-flex h-8 items-center justify-center rounded-md border bg-card/82 px-3 text-sm font-semibold transition-colors"
              >
                {t("library.continue")}
              </Link>
            )}
          </aside>
        </div>

        {(status || error) && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              error
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error ?? status}</span>
          </div>
        )}
        {isScanning && scanJob && (
          <ScanProgressCard
            job={scanJob}
            onCancel={() => void cancelScanJob(scanJob.id).then(({ job }) => setScanJob(job))}
          />
        )}
      </section>

      <section className="studio-library flex min-h-0 flex-col overflow-hidden rounded-md border">
        <div className="studio-library-header flex shrink-0 flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {hasSearchQuery ? t("search.title") : t("library.collection")}
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">
              {hasSearchQuery
                ? t("library.searchingFor", { query: query.trim() })
                : t("library.title")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-sm border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {hasSearchQuery
                ? t("search.resultCount", { count: searchResults.length })
                : t("library.bookCount", { count: books.length })}
            </span>
            <span className="rounded-sm border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {t("library.chapterCount", { count: stats?.totalChapters ?? 0 })}
            </span>
            <span className="rounded-sm border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {t("library.completed", {
                completed: stats?.completedChapters ?? 0,
                total: stats?.totalChapters ?? 0,
              })}
            </span>
            <span className="rounded-sm border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {t("library.reading", {
                time: formatMinutes(displayedReadingMinutes, t),
              })}
            </span>
            <span className="rounded-sm border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {t("library.active", {
                active: activeBooks,
                total: books.length,
              })}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {hasSearchQuery ? (
            <div className="flex h-full min-h-0 flex-col">
              {searchError && (
                <div className="mx-5 mt-5 flex shrink-0 items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}
              {isSearching ? (
                <div className="flex h-full min-h-0 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <div className="studio-results-grid grid gap-3 xl:grid-cols-2">
                    {searchResults.map((result) => (
                      <LibrarySearchResult
                        key={`${result.type}-${result.id}`}
                        result={result}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-muted-foreground">
                  {t("search.noMatches")}
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex h-full min-h-0 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : books.length > 0 ? (
            <div className="scrollbar-soft h-full overflow-y-auto px-5 py-5">
              <div className="studio-book-grid grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] items-stretch gap-4 pb-2 2xl:grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))]">
                {books.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-muted-foreground">
              {t("library.noBooks")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScanProgressCard({
  job,
  onCancel,
}: {
  job: ScanJobStatus;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const percent =
    job.booksTotal > 0
      ? Math.round((job.booksScanned / job.booksTotal) * 100)
      : job.phase === "indexing"
        ? 70
        : 8;
  const phaseLabel =
    job.phase === "indexing"
      ? t("library.indexing")
      : job.phase === "cancelled"
        ? t("library.cancelled")
      : job.phase === "queued"
        ? t("library.queued")
        : t("library.scanning");

  return (
    <div className="mt-3 rounded-md border bg-card/78 px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {phaseLabel}
          {job.currentBook ? ` · ${job.currentBook}` : ""}
        </span>
        <span>
          {job.booksScanned}/{job.booksTotal || "?"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(6, percent))}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {t("library.cancelScan")}
        </button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {t("library.scanProgress", {
          books: job.booksScanned,
          chapters: job.chaptersScanned,
          skipped: job.skippedBooks,
        })}
      </div>
    </div>
  );
}

const resultIcons = {
  book: BookOpen,
  chapter: FileText,
  content: TextSearch,
};

function LibrarySearchResult({ result }: { result: SearchResult }) {
  const { t } = useI18n();
  const Icon = resultIcons[result.type];
  const href = result.chapterId
    ? `/book/${result.bookId}/${result.chapterId}`
    : `/book/${result.bookId}`;
  const highlighted =
    result.type === "content" && Boolean(result.highlightedContent);

  return (
    <Link href={href} className="result-tile block rounded-lg border bg-background/65 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-semibold text-foreground">{result.title}</h2>
            {result.bookTitle && result.type !== "book" && (
              <span className="text-xs text-muted-foreground">
                {t("search.inBook", { book: result.bookTitle })}
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground",
              result.type === "content" && "font-mono text-xs",
            )}
          >
            {highlighted ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: result.highlightedContent ?? "",
                }}
              />
            ) : (
              result.content
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}

function formatMinutes(
  minutes: number,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (minutes < 60) {
    return t("stats.minutes", { minutes });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0
    ? t("stats.hoursMinutes", { hours, minutes: rest })
    : t("stats.hours", { hours });
}
