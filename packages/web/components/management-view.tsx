"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArchiveRestore,
  Download,
  FileJson,
  ImagePlus,
  Loader2,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react";
import { BackupPayload, Book, Bookmark } from "@/types";
import {
  deleteBook,
  deleteBookmark,
  exportBackup,
  getBookAssetUrl,
  getBookmarks,
  getBooks,
  importBackup,
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
  const [isImporting, setIsImporting] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextBooks, nextBookmarks] = await Promise.all([
        getBooks(),
        getBookmarks(),
      ]);
      setBooks(nextBooks);
      setBookmarks(nextBookmarks);
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
      link.download = `juejin-flow-backup-${new Date()
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
      const result = await importBackup(payload);
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
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("management.title")}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t("management.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            {t("management.export")}
          </button>
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
            "flex items-start gap-2 rounded-md border px-4 py-3 text-sm",
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
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-center"
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
      </form>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-2">
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

          <div className="space-y-6">
            <section className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
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
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("management.deleteBook")}
                  </button>
                )}
              </div>

              {selectedBook ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_14rem]">
                  <div className="space-y-4">
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
                        rows={4}
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

                  <div className="overflow-hidden rounded-lg border bg-background">
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

            <section className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="font-semibold">{t("management.bookmarks")}</h2>
              <div className="mt-4 space-y-3">
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
