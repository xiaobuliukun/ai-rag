import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bot, CheckCircle2, Save } from "lucide-react-native";
import type { Book, Chapter } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Screen } from "@/design-system/ui/primitives";
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
  const api = useMemo(() => createMoxuApi(settings.apiBaseUrl), [settings.apiBaseUrl]);
  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [progress, setProgress] = useState(0);
  const [savedProgress, setSavedProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef(0);

  const load = useCallback(async () => {
    if (!bookId || !chapterId) {
      return;
    }

    setError(null);
    try {
      const [nextBook, nextChapter] = await Promise.all([
        api.getBook(bookId),
        api.getChapter(bookId, chapterId)
      ]);
      setBook(nextBook);
      setChapter(nextChapter);
      const initialProgress = Math.round(nextChapter.progress ?? 0);
      setProgress(initialProgress);
      setSavedProgress(initialProgress);
      lastSavedRef.current = initialProgress;
      setReadingContext({
        bookId: nextBook.id,
        chapterId: nextChapter.id,
        bookTitle: nextBook.title,
        chapterTitle: nextChapter.title
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法打开章节");
    } finally {
      setIsLoading(false);
    }
  }, [api, bookId, chapterId, setReadingContext]);

  useEffect(() => {
    void load();
    return () => setReadingContext(undefined);
  }, [load, setReadingContext]);

  const blocks = useMemo(() => parseMarkdown(chapter?.content ?? ""), [chapter?.content]);

  const persistProgress = useCallback(
    async (nextProgress: number) => {
      if (!bookId || !chapterId) {
        return;
      }
      const bounded = Math.min(100, Math.max(0, Math.round(nextProgress)));
      if (bounded === lastSavedRef.current) {
        return;
      }
      setIsSaving(true);
      setError(null);
      try {
        await api.updateChapterProgress(bookId, chapterId, bounded, 0, 0);
        lastSavedRef.current = bounded;
        setSavedProgress(bounded);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存进度失败");
      } finally {
        setIsSaving(false);
      }
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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const readable = Math.max(1, contentSize.height - layoutMeasurement.height);
    const nextProgress = Math.min(100, Math.max(0, Math.round((contentOffset.y / readable) * 100)));
    setProgress((current) => Math.max(current, nextProgress));
  };

  return (
    <Screen>
      <View style={[styles.readerHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Button
          variant="ghost"
          title="返回"
          icon={<ArrowLeft color={colors.primary} size={18} />}
          onPress={() => router.back()}
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
          onScroll={handleScroll}
          scrollEventThrottle={250}
          onMomentumScrollEnd={() => void persistProgress(progress)}
          onScrollEndDrag={() => void persistProgress(progress)}
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
              onPress={() => void persistProgress(progress)}
            />
            <Button
              title="标为已读"
              icon={<CheckCircle2 color={colors.primaryForeground} size={17} />}
              onPress={() => {
                setProgress(100);
                void persistProgress(100);
              }}
            />
            <Button
              title="问 AI"
              variant="ghost"
              icon={<Bot color={colors.primary} size={17} />}
              onPress={() => router.push("/assistant")}
            />
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
  bookId,
  chapterFileName
}: {
  block: MarkdownBlock;
  apiBaseUrl: string;
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
    return src ? (
      <Image
        source={{ uri: src }}
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
