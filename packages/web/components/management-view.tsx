"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  ImagePlus,
  Loader2,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react";
import {
  BackupPayload,
  Book,
  Bookmark,
  ImportBackupMode,
  SearchIndexStatus,
} from "@/types";
import {
  deleteBook,
  deleteBookmark,
  exportBackup,
  getBookAssetUrl,
  getBookmarks,
  getBooks,
  getSearchIndexStatus,
  importBackup,
  rescanKnownBooks,
  scanDirectory,
  updateBook,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const LIBRARY_REFRESH_EVENT = "library:refresh";
const MAX_COVER_IMAGE_SIZE = 1_500_000;

export function ManagementView() {
  const { t } = useI18n();
  const [books, setBooks] = React.useState<Book[]>([]);
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [indexStatus, setIndexStatus] =
    React.useState<SearchIndexStatus | null>(null);
  const [selectedBookId, setSelectedBookId] = React.useState("");
  const [scanPath, setScanPath] = React.useState("");
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    tags: "",
    coverImage: "",
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isRescanningKnown, setIsRescanningKnown] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importMode, setImportMode] =
    React.useState<ImportBackupMode>("merge");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextBooks, nextBookmarks, nextIndexStatus] = await Promise.all([
        getBooks(),
        getBookmarks(),
        getSearchIndexStatus().catch(() => null),
      ]);
      setBooks(nextBooks);
      setBookmarks(nextBookmarks);
      setIndexStatus(nextIndexStatus);
      setSelectedBookId((current) => current || nextBooks[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!selectedBook) {
      setForm({
        title: "",
        description: "",
        tags: "",
        coverImage: "",
      });
      return;
    }

    setForm({
      title: selectedBook.title,
      description: selectedBook.description ?? "",
      tags: selectedBook.tags?.join(", ") ?? "",
      coverImage: selectedBook.coverImage ?? "",
    });
  }, [selectedBook]);

  const refreshLibrary = async () => {
    await loadData();
    window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
  };

  const handleScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = scanPath.trim();
    if (!path) {
      setError(t("library.pathRequired"));
      return;
    }

    setIsScanning(true);
    setStatus(null);
    setError(null);

    try {
      const result = await scanDirectory(path);
      setStatus(result.message);
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.scanFailed"));
    } finally {
      setIsScanning(false);
    }
  };

  const handleRescanKnownBooks = async () => {
    setIsRescanningKnown(true);
    setStatus(null);
    setError(null);

    try {
      const result = await rescanKnownBooks();
      setStatus(result.message);
      await refreshLibrary();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("management.rescanKnownFailed"),
      );
    } finally {
      setIsRescanningKnown(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBook) {
      return;
    }

    setIsSaving(true);
    setStatus(null);
    setError(null);

    try {
      await updateBook(selectedBook.id, {
        title: form.title,
        description: form.description || null,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        coverImage: form.coverImage || null,
      });
      setStatus(t("management.saved"));
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCoverFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setStatus(null);
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError(t("management.coverInvalid"));
      return;
    }

    if (file.size > MAX_COVER_IMAGE_SIZE) {
      setError(t("management.coverTooLarge"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((current) => ({
        ...current,
        coverImage: dataUrl,
      }));
      setStatus(t("management.coverSelected"));
    } catch {
      setError(t("management.coverReadFailed"));
    }
  };

  const handleDeleteBook = async () => {
    if (!selectedBook || !window.confirm(t("management.deleteConfirm"))) {
      return;
    }

    setStatus(null);
    setError(null);

    try {
      await deleteBook(selectedBook.id);
      setSelectedBookId("");
      setStatus(t("management.deleted"));
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.deleteFailed"));
    }
  };

  const handleExport = async () => {
    setStatus(null);
    setError(null);

    try {
      const payload = await exportBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moxu-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus(t("management.exported"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.exportFailed"));
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsImporting(true);
    setStatus(null);
    setError(null);

    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      const result = await importBackup(payload, importMode);
      setStatus(result.message);
      setSelectedBookId("");
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.importFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    setStatus(null);
    setError(null);

    try {
      await deleteBookmark(bookmarkId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("management.deleteFailed"));
    }
  };

  const coverSrc = selectedBook ? resolveCoverImage(selectedBook, form.coverImage) : "";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[88rem] flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("management.title")}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t("management.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            {t("management.export")}
          </button>
          <div
            className="flex rounded-md border bg-card p-1"
            aria-label={t("management.importMode")}
          >
            {(["merge", "replace"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setImportMode(mode)}
                className={cn(
                  "h-8 rounded-sm px-3 text-xs font-medium transition-colors",
                  importMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                title={
                  mode === "merge"
                    ? t("management.importMergeHint")
                    : t("management.importReplaceHint")
                }
              >
                {mode === "merge"
                  ? t("management.importMerge")
                  : t("management.importReplace")}
              </button>
            ))}
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary">
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArchiveRestore className="h-4 w-4" />
            )}
            {t("management.import")}
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {(status || error) && (
        <div
          className={cn(
            "flex shrink-0 items-start gap-2 rounded-md border px-4 py-3 text-sm",
            error
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? status}</span>
        </div>
      )}

      <form
        onSubmit={handleScan}
        className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-center"
      >
        <div className="flex min-w-44 items-center gap-2 font-semibold">
          <ScanLine className="h-4 w-4 text-primary" />
          {t("library.scanTitle")}
        </div>
        <input
          type="text"
          value={scanPath}
          onChange={(event) => setScanPath(event.target.value)}
          placeholder={t("library.scanPlaceholder")}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={isScanning}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4" />
          )}
          {isScanning ? t("library.scanning") : t("library.scan")}
        </button>
        <button
          type="button"
          onClick={handleRescanKnownBooks}
          disabled={isRescanningKnown}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRescanningKnown ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4" />
          )}
          {isRescanningKnown
            ? t("management.rescanningKnown")
            : t("management.rescanKnown")}
        </button>
      </form>

      {indexStatus && <IndexStatusCard status={indexStatus} />}

      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="management-book-list scrollbar-soft min-h-0 space-y-2 overflow-y-auto pr-2">
            {books.length > 0 ? (
              books.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => setSelectedBookId(book.id)}
                  className={cn(
                    "w-full rounded-md border bg-card px-3 py-3 text-left transition-colors hover:border-accent",
                    selectedBookId === book.id &&
                      "border-primary ring-2 ring-primary/20",
                  )}
                >
                  <div className="line-clamp-2 font-medium">{book.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {book.totalChapters ?? book.chapters?.length ?? 0}{" "}
                    {t("book.chapters")}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                {t("library.noBooks")}
              </div>
            )}
          </aside>

          <div className="scrollbar-soft grid min-h-0 gap-5 overflow-y-auto pr-1 xl:grid-cols-[minmax(24rem,1fr)_minmax(16rem,0.72fr)] xl:overflow-hidden">
            <section className="scrollbar-soft min-h-0 overflow-y-auto rounded-lg border bg-card p-4 shadow-sm">
              <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <h2 className="font-semibold">{t("management.metadata")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedBook?.path ?? t("management.selectBook")}
                  </p>
                </div>
                {selectedBook && (
                  <button
                    type="button"
                    onClick={handleDeleteBook}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("management.deleteBook")}
                  </button>
                )}
              </div>

              {selectedBook ? (
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_11rem]">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="mb-2 text-sm font-medium">
                        {t("management.bookTitle")}
                      </div>
                      <input
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-2 text-sm font-medium">
                        {t("management.description")}
                      </div>
                      <textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        rows={3}
                        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <div className="mb-2 text-sm font-medium">
                          {t("management.tags")}
                        </div>
                        <input
                          value={form.tags}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              tags: event.target.value,
                            }))
                          }
                          placeholder="React, TypeScript"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
                        />
                      </label>
                      <div>
                        <div className="mb-2 text-sm font-medium">
                          {t("management.coverImage")}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={form.coverImage}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                coverImage: event.target.value,
                              }))
                            }
                            placeholder="cover.png"
                            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
                          />
                          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary">
                            <ImagePlus className="h-4 w-4" />
                            {t("management.chooseCover")}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleCoverFile}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {t("management.save")}
                    </button>
                  </div>

                  <div className="w-full max-w-40 overflow-hidden rounded-lg border bg-background md:max-w-none">
                    <div className="flex aspect-[3/4] items-center justify-center bg-muted">
                      {coverSrc ? (
                        <Image
                          src={coverSrc}
                          alt={selectedBook.title}
                          width={320}
                          height={420}
                          sizes="224px"
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileJson className="h-12 w-12 text-muted-foreground/40" />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-background p-8 text-center text-muted-foreground">
                  {t("management.selectBook")}
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-col rounded-lg border bg-card p-4 shadow-sm">
              <h2 className="shrink-0 font-semibold">{t("management.bookmarks")}</h2>
              <div className="scrollbar-soft mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                {bookmarks.length > 0 ? (
                  bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="rounded-md border bg-background px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/book/${bookmark.bookId}/${bookmark.chapterId}`}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            {bookmark.note}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {bookmark.bookTitle} / {bookmark.chapterTitle}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBookmark(bookmark.id)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("reader.deleteBookmark")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {bookmark.excerpt && (
                        <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {bookmark.excerpt}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
                    {t("management.noBookmarks")}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function IndexStatusCard({ status }: { status: SearchIndexStatus }) {
  const { t } = useI18n();
  const isReady = status.isFtsReady && status.isVectorReady;
  const embeddingLabel =
    status.embeddingProvider && status.embeddingModel
      ? `${status.embeddingProvider} / ${status.embeddingModel}`
      : t("management.unavailable");

  return (
    <section className="shrink-0 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">{t("management.indexStatus")}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {isReady ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-accent" />
              )}
              <span>{isReady ? t("management.indexReady") : t("management.indexBuilding")}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 md:min-w-[34rem]">
          <IndexMetric
            label={t("management.ftsIndex")}
            value={t("management.chunksIndexed", {
              indexed: status.ftsChunks,
              total: status.totalChunks,
            })}
            ready={status.isFtsReady}
          />
          <IndexMetric
            label={t("management.vectorIndex")}
            value={t("management.chunksIndexed", {
              indexed: status.vectorChunks,
              total: status.totalChunks,
            })}
            ready={status.isVectorReady}
          />
          <IndexMetric label={t("management.embedding")} value={embeddingLabel} />
        </div>
      </div>
    </section>
  );
}

function IndexMetric({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {ready !== undefined && (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              ready ? "bg-primary" : "bg-accent",
            )}
          />
        )}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function resolveCoverImage(book: Book, coverImage: string) {
  if (!coverImage) {
    return "";
  }

  if (/^(https?:|data:|blob:|\/)/i.test(coverImage)) {
    return coverImage;
  }

  return getBookAssetUrl(book.id, coverImage);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("No file data"));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
