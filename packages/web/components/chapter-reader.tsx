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
import { getEffectiveBrightnessPercent } from "@/lib/reader-preferences";
import {
  calculateReadingProgress,
  calculateScrollPercentage,
  calculateScrollTopFromPercentage,
  findAppScrollContainer,
  parseBookmarkPosition,
} from "@/lib/reader-scroll";

const LIBRARY_REFRESH_EVENT = "library:refresh";

interface ChapterReaderProps {
  book: Book;
  chapter: Chapter;
  previousChapter: Chapter | null;
  nextChapter: Chapter | null;
  initialBookmarkPosition?: number;
}

export function ChapterReader({
  book,
  chapter,
  previousChapter,
  nextChapter,
  initialBookmarkPosition,
}: ChapterReaderProps) {
  const { t } = useI18n();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const savedProgressRef = React.useRef(Math.round(chapter.progress ?? 0));
  const savedScrollPositionRef = React.useRef(
    Math.max(0, Math.round(chapter.readingProgress?.scrollPosition ?? 0)),
  );
  const progressRef = React.useRef(savedProgressRef.current);
  const currentScrollProgressRef = React.useRef(0);
  const bookmarkLoadGenerationRef = React.useRef(0);
  const pendingReadingSecondsRef = React.useRef(0);
  const lastReadingTickRef = React.useRef<number | null>(null);
  const saveStateRef = React.useRef<"idle" | "saved" | "error">("idle");
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const queuedSaveCountRef = React.useRef(0);
  const [progress, setProgress] = React.useState(savedProgressRef.current);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = React.useState(false);
  const [bookmarkNote, setBookmarkNote] = React.useState("");
  const [selectedText, setSelectedText] = React.useState("");
  const [showReminder, setShowReminder] = React.useState(false);
  const [isBookmarking, setIsBookmarking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fontSize = useStore((state) => state.fontSize);
  const lineHeight = useStore((state) => state.lineHeight);
  const colorTemperature = useStore((state) => state.colorTemperature);
  const pageBrightness = useStore((state) => state.pageBrightness);
  const autoBrightness = useStore((state) => state.autoBrightness);
  const paperTexture = useStore((state) => state.paperTexture);
  const readingReminderMinutes = useStore(
    (state) => state.readingReminderMinutes,
  );
  const autoSaveIntervalSeconds = useStore(
    (state) => state.autoSaveIntervalSeconds,
  );
  const smoothScrollRestore = useStore((state) => state.smoothScrollRestore);
  const setReadingContext = useStore((state) => state.setReadingContext);
  const [brightnessClock, setBrightnessClock] = React.useState(() => new Date());
  const effectiveBrightness = React.useMemo(
    () =>
      getEffectiveBrightnessPercent(
        pageBrightness,
        autoBrightness,
        brightnessClock,
      ),
    [autoBrightness, brightnessClock, pageBrightness],
  );
  const readerStyle = React.useMemo(
    () =>
      ({
        fontSize,
        lineHeight,
        "--reader-warmth": `${colorTemperature / 100}`,
        "--reader-brightness": `${effectiveBrightness / 100}`,
        "--paper-texture-opacity": paperTexture ? "0.22" : "0",
      }) as React.CSSProperties,
    [colorTemperature, effectiveBrightness, fontSize, lineHeight, paperTexture],
  );
  const autoSaveIntervalMs = React.useMemo(
    () => Math.max(5000, autoSaveIntervalSeconds * 1000),
    [autoSaveIntervalSeconds],
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

  const loadBookmarks = React.useCallback(async (markReady = false) => {
    const generation = bookmarkLoadGenerationRef.current + 1;
    bookmarkLoadGenerationRef.current = generation;
    if (markReady) {
      setBookmarksLoaded(false);
    }

    try {
      const nextBookmarks = await getBookmarks(book.id, chapter.id);
      if (generation === bookmarkLoadGenerationRef.current) {
        setBookmarks(nextBookmarks);
      }
    } catch {
      if (generation === bookmarkLoadGenerationRef.current) {
        setBookmarks([]);
      }
    } finally {
      if (generation === bookmarkLoadGenerationRef.current) {
        setBookmarksLoaded(true);
      }
    }
  }, [book.id, chapter.id]);

  React.useEffect(() => {
    void loadBookmarks(true);
    return () => {
      bookmarkLoadGenerationRef.current += 1;
    };
  }, [loadBookmarks]);

  React.useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  React.useEffect(() => {
    if (!autoBrightness) {
      return;
    }

    const timer = window.setInterval(() => setBrightnessClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [autoBrightness]);

  const scrollToBookmarkPosition = React.useCallback(
    (position: number, behavior: ScrollBehavior = "smooth") => {
      const scrollContainer = findAppScrollContainer();
      const boundedPosition = parseBookmarkPosition(position);
      if (!scrollContainer || boundedPosition === undefined) {
        return;
      }

      currentScrollProgressRef.current = boundedPosition;
      scrollContainer.scrollTo({
        top: calculateScrollTopFromPercentage({
          position: boundedPosition,
          scrollHeight: scrollContainer.scrollHeight,
          viewportHeight: scrollContainer.clientHeight,
        }),
        behavior,
      });
    },
    [],
  );

  React.useEffect(() => {
    const scrollContainer = findAppScrollContainer();
    if (!scrollContainer) {
      return;
    }
    const scrollPosition = Math.max(
      0,
      Math.round(chapter.readingProgress?.scrollPosition ?? 0),
    );
    savedScrollPositionRef.current = scrollPosition;
    scrollContainer.scrollTo({ top: 0, behavior: "auto" });
    if (!bookmarksLoaded) {
      return;
    }
    const bookmarkPosition = parseBookmarkPosition(initialBookmarkPosition);
    let secondFrame: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let stopTrackingInitialLayout: (() => void) | undefined;

    const applyInitialPosition = (behavior: ScrollBehavior) => {
      if (bookmarkPosition !== undefined) {
        scrollToBookmarkPosition(bookmarkPosition, behavior);
        return;
      }

      scrollContainer.scrollTo({
        top: scrollPosition,
        behavior,
      });
    };

    const frame = window.requestAnimationFrame(() => {
      applyInitialPosition(
        bookmarkPosition !== undefined || !smoothScrollRestore
          ? "auto"
          : "smooth",
      );
      secondFrame = window.requestAnimationFrame(() => {
        if (bookmarkPosition !== undefined) {
          applyInitialPosition("auto");
        }
      });
    });

    if (
      bookmarkPosition !== undefined &&
      contentRef.current &&
      typeof ResizeObserver !== "undefined"
    ) {
      resizeObserver = new ResizeObserver(() => applyInitialPosition("auto"));
      resizeObserver.observe(contentRef.current);
      stopTrackingInitialLayout = () => {
        resizeObserver?.disconnect();
        resizeObserver = undefined;
      };
      scrollContainer.addEventListener("wheel", stopTrackingInitialLayout, {
        passive: true,
      });
      scrollContainer.addEventListener(
        "touchstart",
        stopTrackingInitialLayout,
        { passive: true },
      );
      scrollContainer.addEventListener(
        "pointerdown",
        stopTrackingInitialLayout,
        { passive: true },
      );
      window.addEventListener("keydown", stopTrackingInitialLayout);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      if (secondFrame !== undefined) {
        window.cancelAnimationFrame(secondFrame);
      }
      if (stopTrackingInitialLayout) {
        scrollContainer.removeEventListener(
          "wheel",
          stopTrackingInitialLayout,
        );
        scrollContainer.removeEventListener(
          "touchstart",
          stopTrackingInitialLayout,
        );
        scrollContainer.removeEventListener(
          "pointerdown",
          stopTrackingInitialLayout,
        );
        window.removeEventListener("keydown", stopTrackingInitialLayout);
      }
      resizeObserver?.disconnect();
    };
  }, [
    chapter.id,
    chapter.readingProgress?.scrollPosition,
    bookmarksLoaded,
    initialBookmarkPosition,
    scrollToBookmarkPosition,
    smoothScrollRestore,
  ]);

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
    (nextProgress: number) => {
      const bounded = Math.min(100, Math.max(0, Math.round(nextProgress)));
      const scrollPosition = Math.max(
        0,
        Math.round(findAppScrollContainer()?.scrollTop ?? 0),
      );
      queuedSaveCountRef.current += 1;
      setIsSaving(true);
      setError(null);

      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const readingSecondsDelta = Math.floor(
            pendingReadingSecondsRef.current,
          );
          pendingReadingSecondsRef.current -= readingSecondsDelta;

          if (
            bounded === savedProgressRef.current &&
            scrollPosition === savedScrollPositionRef.current &&
            readingSecondsDelta <= 0 &&
            saveStateRef.current !== "error"
          ) {
            return;
          }

          try {
            await updateChapterProgress(
              book.id,
              chapter.id,
              bounded,
              scrollPosition,
              readingSecondsDelta,
            );
            savedProgressRef.current = bounded;
            savedScrollPositionRef.current = scrollPosition;
            saveStateRef.current = "saved";
            setSaveState("saved");
            window.dispatchEvent(new Event(LIBRARY_REFRESH_EVENT));
          } catch (err) {
            if (readingSecondsDelta > 0) {
              pendingReadingSecondsRef.current += readingSecondsDelta;
            }
            saveStateRef.current = "error";
            setSaveState("error");
            setError(
              err instanceof Error ? err.message : t("reader.saveFailed"),
            );
          }
        });

      saveQueueRef.current = queuedSave;
      return queuedSave.finally(() => {
        queuedSaveCountRef.current = Math.max(
          0,
          queuedSaveCountRef.current - 1,
        );
        if (queuedSaveCountRef.current === 0) {
          setIsSaving(false);
        }
      });
    },
    [book.id, chapter.id, t],
  );

  React.useEffect(() => {
    if (progress === savedProgressRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistProgress(progress);
    }, autoSaveIntervalMs);

    return () => window.clearTimeout(timer);
  }, [autoSaveIntervalMs, persistProgress, progress]);

  React.useEffect(() => {
    const readTick = () => {
      const now = Date.now();
      const lastTick = lastReadingTickRef.current ?? now;
      lastReadingTickRef.current = now;

      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        return;
      }

      const elapsedSeconds = Math.min(
        30,
        Math.max(0, Math.floor((now - lastTick) / 1000)),
      );
      pendingReadingSecondsRef.current += elapsedSeconds;
    };

    lastReadingTickRef.current = Date.now();
    const tickTimer = window.setInterval(readTick, 5000);
    const flushTimer = window.setInterval(() => {
      readTick();
      void persistProgress(progressRef.current);
    }, autoSaveIntervalMs);
    const flushOnVisibilityChange = () => {
      readTick();
      if (document.visibilityState === "hidden") {
        void persistProgress(progressRef.current);
      }
    };

    document.addEventListener("visibilitychange", flushOnVisibilityChange);

    return () => {
      readTick();
      void persistProgress(progressRef.current);
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);
      document.removeEventListener("visibilitychange", flushOnVisibilityChange);
    };
  }, [autoSaveIntervalMs, persistProgress]);

  React.useEffect(() => {
    const scrollContainer = findAppScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const updateFromScroll = () => {
      const content = contentRef.current;
      if (!content) {
        return;
      }

      const contentRect = content.getBoundingClientRect();
      const viewportRect = scrollContainer.getBoundingClientRect();
      const nextProgress = calculateReadingProgress({
        contentTop: contentRect.top,
        contentHeight: contentRect.height,
        viewportTop: viewportRect.top,
        viewportHeight: scrollContainer.clientHeight,
      });

      currentScrollProgressRef.current = calculateScrollPercentage({
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        viewportHeight: scrollContainer.clientHeight,
      });
      setProgress((current) => Math.max(current, nextProgress));
    };

    updateFromScroll();
    scrollContainer.addEventListener("scroll", updateFromScroll, {
      passive: true,
    });
    window.addEventListener("resize", updateFromScroll);

    return () => {
      scrollContainer.removeEventListener("scroll", updateFromScroll);
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
        position: currentScrollProgressRef.current,
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
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              scrollToBookmarkPosition(bookmark.position)
                            }
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                          >
                            {t("reader.jumpBookmark")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeleteBookmark(bookmark.id)
                            }
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("reader.deleteBookmark")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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
