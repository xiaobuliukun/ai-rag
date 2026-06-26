"use client";

import * as React from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  FolderSearch,
  Loader2,
  Search,
  RefreshCw,
  Timer,
} from "lucide-react";
import { Book, LibraryStats } from "@/types";
import { BookCard } from "@/components/book-card";
import { cn } from "@/lib/utils";
import { getBooks, getLibraryStats, scanDirectory } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const LIBRARY_REFRESH_EVENT = "library:refresh";

export function LibraryView() {
  const { t } = useI18n();
  const [books, setBooks] = React.useState<Book[]>([]);
  const [stats, setStats] = React.useState<LibraryStats | null>(null);
  const [query, setQuery] = React.useState("");
  const [scanPath, setScanPath] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isScanning, setIsScanning] = React.useState(false);

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

  const filteredBooks = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return books;

    return books.filter((book) => book.title.toLowerCase().includes(keyword));
  }, [books, query]);

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
      const result = await scanDirectory(path);
      setStatus(result.message);
      await loadBooks();
      window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.scanFailed"));
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("library.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {books.length > 0
                ? t("library.count", { count: books.length })
                : t("library.emptyHint")}
            </p>
          </div>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("library.searchPlaceholder")}
              className="h-10 w-full rounded-md border bg-background pl-9 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <form
          onSubmit={handleScan}
          className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FolderSearch className="h-4 w-4 text-primary" />
            <span>{t("library.scanTitle")}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={scanPath}
              onChange={(event) => setScanPath(event.target.value)}
              placeholder={t("library.scanPlaceholder")}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="submit"
              disabled={isScanning}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>{isScanning ? t("library.scanning") : t("library.scan")}</span>
            </button>
          </div>
          {(status || error) && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                error
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error ?? status}</span>
            </div>
          )}
        </form>
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={BookOpenCheck}
            label={t("stats.completedChapters")}
            value={`${stats.completedChapters}/${stats.totalChapters}`}
            helper={t("stats.completionRate", {
              percent: stats.completionRate,
            })}
          />
          <StatCard
            icon={Timer}
            label={t("stats.readingTime")}
            value={formatMinutes(stats.estimatedReadingMinutes, t)}
            helper={t("stats.estimated")}
          />
          <StatCard
            icon={CalendarDays}
            label={t("stats.learningDays")}
            value={String(stats.learningDays)}
            helper={
              stats.latestReadAt
                ? t("stats.latestRead", {
                    date: new Date(stats.latestReadAt).toLocaleDateString(),
                  })
                : t("stats.noReadingYet")
            }
          />
          <StatCard
            icon={BarChart3}
            label={t("stats.inProgress")}
            value={String(stats.inProgressChapters)}
            helper={t("stats.totalBooks", { count: stats.totalBooks })}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredBooks.length > 0 ? (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-lg border bg-card px-6 text-center text-muted-foreground">
          {books.length > 0
            ? t("library.noMatches")
            : t("library.noBooks")}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
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
