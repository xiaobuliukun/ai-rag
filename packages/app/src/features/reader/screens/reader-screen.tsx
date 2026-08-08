import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BookmarkPlus,
  Bot,
  CheckCircle2,
  Save,
  Trash2
} from "lucide-react-native";
import type { AiContext, Book, Bookmark, Chapter } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Field, Screen } from "@/design-system/ui/primitives";
import {
  parseMarkdown,
  resolveMarkdownImageSrc,
  type MarkdownBlock
} from "@/domains/reader/markdown";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

export function ReaderScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { settings, setReadingContext } = useAppSettings();
  const { bookId, chapterId } = useLocalSearchParams<{
    bookId: string;
    chapterId: string;
  }>();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [progress, setProgress] = useState(0);
  const [savedProgress, setSavedProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const scrollableHeightRef = useRef(0);
  const pendingRestoreRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const currentScrollProgressRef = useRef(0);
  const lastSavedRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const pendingReadingSecondsRef = useRef(0);
  const lastReadingTickRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);
  const isReaderFocusedRef = useRef(false);
  const isChapterReadyRef = useRef(false);
  const readingContextRef = useRef<AiContext | undefined>(undefined);
  const loadGenerationRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSaveCountRef = useRef(0);

  const load = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    if (!bookId || !chapterId) {
      setIsLoading(false);
      return;
    }

    isChapterReadyRef.current = false;
    readingContextRef.current = undefined;
    setReadingContext(undefined);
    setBook(null);
    setChapter(null);
    setBookmarks([]);
    setIsLoading(true);
    setError(null);
    try {
      const [nextBook, nextChapter, nextBookmarks] = await Promise.all([
        api.getBook(bookId),
        api.getChapter(bookId, chapterId),
        api.getBookmarks(bookId, chapterId).catch(() => [])
      ]);
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setBook(nextBook);
      setChapter(nextChapter);
      setBookmarks(nextBookmarks);
      const initialProgress = Math.round(nextChapter.progress ?? 0);
      setProgress(initialProgress);
      progressRef.current = initialProgress;
      currentScrollProgressRef.current = 0;
      setSavedProgress(initialProgress);
      lastSavedRef.current = initialProgress;
      const initialScrollPosition = Math.max(
        0,
        nextChapter.readingProgress?.scrollPosition ?? 0
      );
      scrollPositionRef.current = initialScrollPosition;
      lastSavedPositionRef.current = initialScrollPosition;
      pendingRestoreRef.current = initialScrollPosition;
      pendingReadingSecondsRef.current = 0;
      lastReadingTickRef.current = Date.now();
      isChapterReadyRef.current = true;
      const nextReadingContext = {
        bookId: nextBook.id,
        chapterId: nextChapter.id,
        bookTitle: nextBook.title,
        chapterTitle: nextChapter.title
      };
      readingContextRef.current = nextReadingContext;
      setReadingContext(nextReadingContext);
    } catch (err) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      isChapterReadyRef.current = false;
      readingContextRef.current = undefined;
      setReadingContext(undefined);
      setBook(null);
      setChapter(null);
      setBookmarks([]);
      pendingRestoreRef.current = null;
      setError(err instanceof Error ? err.message : "无法打开章节");
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [api, bookId, chapterId, setReadingContext]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
      isChapterReadyRef.current = false;
      readingContextRef.current = undefined;
      setReadingContext(undefined);
    };
  }, [load, setReadingContext]);

  const blocks = useMemo(() => parseMarkdown(chapter?.content ?? ""), [chapter?.content]);

  const recordReadingTime = useCallback(() => {
    const now = Date.now();
    const elapsedSeconds = Math.min(
      30,
      Math.max(0, Math.floor((now - lastReadingTickRef.current) / 1000))
    );
    lastReadingTickRef.current = now;

    if (
      !isChapterReadyRef.current ||
      !isReaderFocusedRef.current ||
      appStateRef.current !== "active"
    ) {
      return;
    }

    pendingReadingSecondsRef.current += elapsedSeconds;
  }, []);

  const persistProgress = useCallback(
    (nextProgress: number) => {
      if (!bookId || !chapterId) {
        return Promise.resolve();
      }
      const bounded = Math.min(100, Math.max(0, Math.round(nextProgress)));
      const scrollPosition = Math.max(0, Math.round(scrollPositionRef.current));
      queuedSaveCountRef.current += 1;
      setIsSaving(true);
      setError(null);

      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const readingSecondsDelta = Math.floor(
            pendingReadingSecondsRef.current
          );
          pendingReadingSecondsRef.current -= readingSecondsDelta;

          if (
            bounded === lastSavedRef.current &&
            Math.abs(scrollPosition - lastSavedPositionRef.current) < 2 &&
            readingSecondsDelta <= 0
          ) {
            return;
          }

          try {
            await api.updateChapterProgress(
              bookId,
              chapterId,
              bounded,
              scrollPosition,
              readingSecondsDelta
            );
            lastSavedRef.current = bounded;
            lastSavedPositionRef.current = scrollPosition;
            setSavedProgress(bounded);
          } catch (err) {
            if (readingSecondsDelta > 0) {
              pendingReadingSecondsRef.current += readingSecondsDelta;
            }
            setError(err instanceof Error ? err.message : "保存进度失败");
          }
        });

      saveQueueRef.current = queuedSave;
      return queuedSave.finally(() => {
        queuedSaveCountRef.current = Math.max(
          0,
          queuedSaveCountRef.current - 1
        );
        if (queuedSaveCountRef.current === 0) {
          setIsSaving(false);
        }
      });
    },
    [api, bookId, chapterId]
  );

  useEffect(() => {
    if (Math.abs(progress - savedProgress) < 8 && progress !== 100) {
      return;
    }
    const timer = setTimeout(() => {
      void persistProgress(progress);
    }, 1200);
    return () => clearTimeout(timer);
  }, [persistProgress, progress, savedProgress]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useFocusEffect(
    useCallback(() => {
      isReaderFocusedRef.current = true;
      lastReadingTickRef.current = Date.now();
      if (readingContextRef.current) {
        setReadingContext(readingContextRef.current);
      }

      return () => {
        recordReadingTime();
        isReaderFocusedRef.current = false;
        void persistProgress(progressRef.current);
      };
    }, [persistProgress, recordReadingTime, setReadingContext])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      recordReadingTime();
      appStateRef.current = nextState;
      lastReadingTickRef.current = Date.now();
      if (nextState !== "active") {
        void persistProgress(progressRef.current);
      }
    });

    return () => subscription.remove();
  }, [persistProgress, recordReadingTime]);

  useEffect(() => {
    if (!chapter) {
      return;
    }

    const readingTimer = setInterval(recordReadingTime, 5_000);
    const flushTimer = setInterval(() => {
      recordReadingTime();
      void persistProgress(progressRef.current);
    }, 30_000);
    return () => {
      clearInterval(readingTimer);
      clearInterval(flushTimer);
    };
  }, [chapter, persistProgress, recordReadingTime]);

  const handleLayout = (event: LayoutChangeEvent) => {
    viewportHeightRef.current = Math.max(0, event.nativeEvent.layout.height);
    scrollableHeightRef.current = Math.max(
      0,
      contentHeightRef.current - viewportHeightRef.current
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollPositionRef.current = Math.max(0, contentOffset.y);
    const readable = Math.max(1, contentSize.height - layoutMeasurement.height);
    contentHeightRef.current = contentSize.height;
    viewportHeightRef.current = layoutMeasurement.height;
    scrollableHeightRef.current = Math.max(0, readable);
    const nextProgress = Math.min(100, Math.max(0, Math.round((contentOffset.y / readable) * 100)));
    currentScrollProgressRef.current = nextProgress;
    progressRef.current = Math.max(progressRef.current, nextProgress);
    setProgress((current) => Math.max(current, nextProgress));
  };

  const handleCreateBookmark = async () => {
    if (!bookId || !chapterId) {
      return;
    }

    setError(null);
    try {
      const currentPosition = Math.min(
        100,
        Math.max(0, Math.round(currentScrollProgressRef.current))
      );
      const bookmark = await api.createBookmark({
        bookId,
        chapterId,
        note: bookmarkNote.trim() || "阅读位置 " + currentPosition + "%",
        position: currentPosition
      });
      setBookmarks((current) => [bookmark, ...current]);
      setBookmarkNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加书签失败");
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    setError(null);
    try {
      await api.deleteBookmark(id);
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除书签失败");
    }
  };

  return (
    <Screen>
      <View style={[styles.readerHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Button
          variant="ghost"
          title="返回"
          icon={<ArrowLeft color={colors.primary} size={18} />}
          onPress={() => {
            recordReadingTime();
            void persistProgress(progressRef.current).finally(() => router.back());
          }}
        />
        <View style={styles.headerProgress}>
          <AppText variant="caption" tone="muted">
            {isSaving ? "保存中" : `已保存 ${savedProgress}%`}
          </AppText>
          <View style={[styles.headerTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.headerFill,
                { backgroundColor: colors.primary, width: `${progress}%` }
              ]}
            />
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText tone="muted">正在载入章节</AppText>
        </View>
      ) : error && !chapter ? (
        <View style={styles.content}>
          <Card>
            <AppText variant="subtitle">打开失败</AppText>
            <AppText tone="danger" style={styles.topGap}>
              {error}
            </AppText>
          </Card>
        </View>
      ) : chapter && book ? (
        <ScrollView
          ref={scrollRef}
          onLayout={handleLayout}
          onScroll={handleScroll}
          scrollEventThrottle={250}
          onMomentumScrollEnd={() => {
            recordReadingTime();
            void persistProgress(progressRef.current);
          }}
          onScrollEndDrag={() => {
            recordReadingTime();
            void persistProgress(progressRef.current);
          }}
          onContentSizeChange={(_width, height) => {
            contentHeightRef.current = Math.max(0, height);
            scrollableHeightRef.current = Math.max(
              0,
              contentHeightRef.current - viewportHeightRef.current
            );
            const target = pendingRestoreRef.current;
            if (target === null) {
              return;
            }
            pendingRestoreRef.current = null;
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({ y: target, animated: false });
            });
          }}
          contentContainerStyle={styles.content}
        >
          <View style={styles.chapterTitle}>
            <AppText variant="caption" tone="muted">
              {book.title}
            </AppText>
            <AppText variant="title">{chapter.title}</AppText>
          </View>

          <Card style={styles.actionBar}>
            <Button
              title="保存"
              variant="secondary"
              loading={isSaving}
              icon={<Save color={colors.foreground} size={17} />}
              onPress={() => {
                recordReadingTime();
                void persistProgress(progressRef.current);
              }}
            />
            <Button
              title="标为已读"
              icon={<CheckCircle2 color={colors.primaryForeground} size={17} />}
              onPress={() => {
                progressRef.current = 100;
                setProgress(100);
                recordReadingTime();
                void persistProgress(100);
              }}
            />
            <Button
              title="问 AI"
              variant="ghost"
              icon={<Bot color={colors.primary} size={17} />}
              onPress={() => {
                recordReadingTime();
                void persistProgress(progressRef.current).finally(() =>
                  router.push("/assistant")
                );
              }}
            />
          </Card>

          <Card style={styles.bookmarkCard}>
            <View style={styles.bookmarkHeader}>
              <View style={styles.bookmarkTitle}>
                <BookmarkPlus color={colors.primary} size={18} />
                <AppText variant="subtitle">章节书签</AppText>
              </View>
              <AppText variant="caption" tone="muted">
                {bookmarks.length} 条
              </AppText>
            </View>
            <Field
              value={bookmarkNote}
              onChangeText={setBookmarkNote}
              placeholder="添加书签备注（可选）"
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateBookmark()}
            />
            <Button
              title="保存当前位置"
              variant="secondary"
              icon={<BookmarkPlus color={colors.foreground} size={16} />}
              onPress={() => void handleCreateBookmark()}
            />
            {bookmarks.map((bookmark) => (
              <View
                key={bookmark.id}
                style={[styles.bookmarkRow, { borderTopColor: colors.border }]}
              >
                <View style={styles.bookmarkText}>
                  <AppText variant="label">{bookmark.note}</AppText>
                  <AppText variant="caption" tone="muted">
                    位置 {Math.round(bookmark.position)}%
                  </AppText>
                </View>
                <View style={styles.bookmarkActions}>
                  <Button
                    title="跳转"
                    variant="ghost"
                    onPress={() => {
                      const percentage = Math.min(
                        100,
                        Math.max(0, bookmark.position)
                      );
                      scrollRef.current?.scrollTo({
                        y: (percentage / 100) * scrollableHeightRef.current,
                        animated: true
                      });
                    }}
                  />
                  <Button
                    title=""
                    variant="ghost"
                    icon={<Trash2 color={colors.danger} size={16} />}
                    onPress={() => void handleDeleteBookmark(bookmark.id)}
                  />
                </View>
              </View>
            ))}
          </Card>

          {error ? (
            <Card>
              <AppText tone="danger">{error}</AppText>
            </Card>
          ) : null}

          <View style={styles.markdown}>
            {blocks.map((block, index) => (
              <MarkdownBlockView
                key={`${block.type}-${index}`}
                block={block}
                apiBaseUrl={settings.apiBaseUrl}
                apiAccessToken={settings.apiAccessToken}
                bookId={book.id}
                chapterFileName={chapter.fileName}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function MarkdownBlockView({
  block,
  apiBaseUrl,
  apiAccessToken,
  bookId,
  chapterFileName
}: {
  block: MarkdownBlock;
  apiBaseUrl: string;
  apiAccessToken?: string;
  bookId: string;
  chapterFileName: string;
}) {
  const { colors } = useAppTheme();

  if (block.type === "heading") {
    return (
      <AppText
        variant={block.level <= 2 ? "subtitle" : "label"}
        style={[styles.mdBlock, block.level <= 2 && styles.heading]}
      >
        {block.text}
      </AppText>
    );
  }

  if (block.type === "quote") {
    return (
      <View style={[styles.quote, { borderLeftColor: colors.accent, backgroundColor: colors.accentMuted }]}>
        <AppText>{block.text}</AppText>
      </View>
    );
  }

  if (block.type === "list") {
    return (
      <View style={styles.mdBlock}>
        {block.items.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.listItem}>
            <AppText tone="primary">•</AppText>
            <AppText style={styles.listText}>{item}</AppText>
          </View>
        ))}
      </View>
    );
  }

  if (block.type === "code") {
    return (
      <View style={[styles.codeBlock, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        {block.language ? (
          <AppText variant="caption" tone="muted" style={styles.codeLanguage}>
            {block.language}
          </AppText>
        ) : null}
        <AppText style={styles.codeText}>{block.text}</AppText>
      </View>
    );
  }

  if (block.type === "image") {
    const src = resolveMarkdownImageSrc(block.src, apiBaseUrl, bookId, chapterFileName);
    const bearerToken = apiAccessToken?.trim();
    const isApiAsset = src.startsWith(
      `${apiBaseUrl.replace(/\/$/, "")}/assets/`
    );
    return src ? (
      <Image
        source={{
          uri: src,
          ...(bearerToken && isApiAsset
            ? { headers: { Authorization: `Bearer ${bearerToken}` } }
            : {})
        }}
        accessibilityLabel={block.alt || "Markdown image"}
        resizeMode="contain"
        style={[styles.image, { backgroundColor: colors.surfaceMuted }]}
      />
    ) : null;
  }

  return (
    <AppText style={styles.paragraph}>
      {block.text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  readerHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 8
  },
  headerProgress: {
    flex: 1,
    minWidth: 0
  },
  headerTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 5
  },
  headerFill: {
    height: "100%"
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 16
  },
  chapterTitle: {
    gap: 6
  },
  topGap: {
    marginTop: 8
  },
  actionBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  bookmarkCard: {
    gap: 12
  },
  bookmarkHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  bookmarkTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  bookmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10
  },
  bookmarkText: {
    flex: 1,
    minWidth: 0
  },
  bookmarkActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  markdown: {
    gap: 12
  },
  mdBlock: {
    marginTop: 4
  },
  heading: {
    marginTop: 18
  },
  paragraph: {
    fontSize: 17,
    lineHeight: 30
  },
  quote: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6
  },
  listText: {
    flex: 1
  },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12
  },
  codeLanguage: {
    marginBottom: 6
  },
  codeText: {
    fontFamily: "Courier",
    fontSize: 14,
    lineHeight: 20
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 8
  }
});
