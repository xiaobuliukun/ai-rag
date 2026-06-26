"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  Trash2,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { Book, Bookmark, Chapter } from "@/types";
import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
  updateChapterProgress,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { MarkdownReader } from "@/components/markdown-reader";
import { useStore } from "@/store/useStore";
import { useI18n } from "@/lib/i18n";

const LIBRARY_REFRESH_EVENT = "library:refresh";

interface ChapterReaderProps {
  book: Book;
  chapter: Chapter;
  previousChapter: Chapter | null;
  nextChapter: Chapter | null;
}

export function ChapterReader({
  book,
  chapter,
  previousChapter,
  nextChapter,
}: ChapterReaderProps) {
  const { t } = useI18n();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const savedProgressRef = React.useRef(Math.round(chapter.progress ?? 0));
  const [progress, setProgress] = React.useState(savedProgressRef.current);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [bookmarkNote, setBookmarkNote] = React.useState("");
  const [selectedText, setSelectedText] = React.useState("");
  const [showReminder, setShowReminder] = React.useState(false);
  const [isBookmarking, setIsBookmarking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fontSize = useStore((state) => state.fontSize);
  const lineHeight = useStore((state) => state.lineHeight);
  const colorTemperature = useStore((state) => state.colorTemperature);
  const pageBrightness = useStore((state) => state.pageBrightness);
  const paperTexture = useStore((state) => state.paperTexture);
  const readingReminderMinutes = useStore(
    (state) => state.readingReminderMinutes,
  );
  const setReadingContext = useStore((state) => state.setReadingContext);
  const readerStyle = React.useMemo(
    () =>
      ({
        fontSize,
        lineHeight,
        "--reader-warmth": `${colorTemperature / 100}`,
        "--reader-brightness": `${pageBrightness / 100}`,
        "--paper-texture-opacity": paperTexture ? "0.22" : "0",
      }) as React.CSSProperties,
    [colorTemperature, fontSize, lineHeight, pageBrightness, paperTexture],
  );

  const baseReadingContext = React.useMemo(
    () => ({
      bookId: book.id,
      chapterId: chapter.id,
      bookTitle: book.title,
      chapterTitle: chapter.title,
    }),
    [book.id, book.title, chapter.id, chapter.title],
  );

  React.useEffect(() => {
    setReadingContext(baseReadingContext);

    return () => {
      setReadingContext(undefined);
    };
  }, [baseReadingContext, setReadingContext]);

  const loadBookmarks = React.useCallback(async () => {
    try {
      setBookmarks(await getBookmarks(book.id, chapter.id));
    } catch {
      setBookmarks([]);
    }
  }, [book.id, chapter.id]);

  React.useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  React.useEffect(() => {
    const scrollPosition = chapter.readingProgress?.scrollPosition ?? 0;
    if (scrollPosition <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chapter.id, chapter.readingProgress?.scrollPosition]);

  React.useEffect(() => {
    setShowReminder(false);
    if (readingReminderMinutes <= 0) {
      return;
    }

    const timer = window.setTimeout(
      () => setShowReminder(true),
      readingReminderMinutes * 60 * 1000,
    );

    return () => window.clearTimeout(timer);
  }, [chapter.id, readingReminderMinutes]);

  const persistProgress = React.useCallback(
    async (nextProgress: number) => {
      const bounded = Math.min(100, Math.max(0, Math.round(nextProgress)));
      if (bounded === savedProgressRef.current && saveState !== "error") {
        return;
      }

      setIsSaving(true);
      setError(null);

      try {
        await updateChapterProgress(book.id, chapter.id, bounded, window.scrollY);
        savedProgressRef.current = bounded;
        setSaveState("saved");
        window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
      } catch (err) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : t("reader.saveFailed"));
      } finally {
        setIsSaving(false);
      }
    },
    [book.id, chapter.id, saveState, t],
  );

  React.useEffect(() => {
    if (progress === savedProgressRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistProgress(progress);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [persistProgress, progress]);

  React.useEffect(() => {
    const updateFromScroll = () => {
      const content = contentRef.current;
      if (!content) {
        return;
      }

      const rect = content.getBoundingClientRect();
      const readableHeight = Math.max(1, rect.height - window.innerHeight * 0.35);
      const readDistance = Math.min(
        readableHeight,
        Math.max(0, window.innerHeight * 0.55 - rect.top),
      );
      const nextProgress = Math.round((readDistance / readableHeight) * 100);

      setProgress((current) => Math.max(current, nextProgress));
    };

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("resize", updateFromScroll);

    return () => {
      window.removeEventListener("scroll", updateFromScroll);
      window.removeEventListener("resize", updateFromScroll);
    };
  }, []);

  const handleManualSave = (nextProgress: number) => {
    const bounded = Math.min(100, Math.max(0, Math.round(nextProgress)));
    setProgress(bounded);
    void persistProgress(bounded);
  };

  const handleTextSelection = () => {
    const nextSelectedText = window.getSelection()?.toString().trim();
    if (!nextSelectedText) {
      return;
    }

    setSelectedText(nextSelectedText.slice(0, 2000));
    setReadingContext({
      ...baseReadingContext,
      selectedText: nextSelectedText.slice(0, 2000),
    });
  };

  const handleCreateBookmark = async () => {
    const note = bookmarkNote.trim() || selectedText.slice(0, 120);
    if (!note) {
      return;
    }

    setIsBookmarking(true);
    setError(null);

    try {
      await createBookmark({
        bookId: book.id,
        chapterId: chapter.id,
        note,
        excerpt: selectedText,
        position: progress,
      });
      setBookmarkNote("");
      await loadBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reader.bookmarkFailed"));
    } finally {
      setIsBookmarking(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    setError(null);

    try {
      await deleteBookmark(bookmarkId);
      await loadBookmarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reader.bookmarkFailed"));
    }
  };

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-6 border-b pt-6 pb-4">
          <div className="text-sm text-muted-foreground">{book.title}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {chapter.title}
          </h1>

          <div className="mt-5 rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{t("reader.progress")}</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(event) => setProgress(Number(event.target.value))}
                  onMouseUp={(event) =>
                    handleManualSave(Number(event.currentTarget.value))
                  }
                  onTouchEnd={(event) =>
                    handleManualSave(Number(event.currentTarget.value))
                  }
                  className="mt-3 w-full accent-primary"
                />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleManualSave(progress)}
                  disabled={isSaving}
                  className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveState === "saved" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t("reader.save")}
                </button>
                <button
                  type="button"
                  onClick={() => handleManualSave(100)}
                  disabled={isSaving || progress === 100}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("reader.markRead")}
                </button>
              </div>
            </div>

            {(saveState === "saved" || error) && (
              <div
                className={cn(
                  "mt-3 text-xs",
                  error ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {error ?? t("reader.progressSaved")}
              </div>
            )}

            {showReminder && (
              <div className="mt-4 flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-3 text-sm">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t("reader.restReminder")}</div>
                  <div className="mt-1 text-muted-foreground">
                    {t("reader.restReminderBody")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReminder(false)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={t("reader.dismissReminder")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="mt-5 border-t pt-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <textarea
                  value={bookmarkNote}
                  onChange={(event) => setBookmarkNote(event.target.value)}
                  rows={2}
                  placeholder={
                    selectedText
                      ? t("reader.bookmarkPlaceholderWithSelection")
                      : t("reader.bookmarkPlaceholder")
                  }
                  className="min-h-20 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={handleCreateBookmark}
                  disabled={isBookmarking || (!bookmarkNote.trim() && !selectedText)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBookmarking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  {t("reader.addBookmark")}
                </button>
              </div>

              {selectedText && (
                <div className="mt-2 line-clamp-2 rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  {selectedText}
                </div>
              )}

              {bookmarks.length > 0 && (
                <div className="mt-4 space-y-2">
                  {bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{bookmark.note}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("reader.bookmarkPosition", {
                              position: bookmark.position,
                            })}
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
                        <div className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {bookmark.excerpt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          ref={contentRef}
          onMouseUp={handleTextSelection}
          onKeyUp={handleTextSelection}
          className="reader-paper rounded-lg"
          style={readerStyle}
        >
          {chapter.content ? (
            <MarkdownReader
              content={chapter.content}
              bookId={book.id}
              chapterFileName={chapter.fileName}
              style={{ fontSize, lineHeight }}
            />
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              {t("reader.noContent")}
            </div>
          )}
        </div>

        <div className="mt-12 flex justify-between border-t py-8">
          {previousChapter ? (
            <Link
              href={`/book/${book.id}/${previousChapter.id}`}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("reader.previous")}
            </Link>
          ) : (
            <span className="px-4 py-2 text-muted-foreground">
              {t("reader.previous")}
            </span>
          )}
          {nextChapter ? (
            <Link
              href={`/book/${book.id}/${nextChapter.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("reader.next")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="px-4 py-2 text-muted-foreground">
              {t("reader.next")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
