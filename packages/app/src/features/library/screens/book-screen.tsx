import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react-native";
import type { Book } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Screen, SectionHeader } from "@/design-system/ui/primitives";
import { sortChapters } from "@/domains/library/models";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

export function BookScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { colors } = useAppTheme();
  const { settings } = useAppSettings();
  const api = useMemo(() => createMoxuApi(settings.apiBaseUrl), [settings.apiBaseUrl]);
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setError(null);
    try {
      setBook(await api.getBook(bookId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取书籍");
    } finally {
      setIsLoading(false);
    }
  }, [api, bookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chapters = sortChapters(book?.chapters ?? []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}>
          <Button
            variant="ghost"
            title="返回"
            icon={<ArrowLeft color={colors.primary} size={18} />}
            onPress={() => router.back()}
          />
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="muted">正在打开书籍</AppText>
          </View>
        ) : error || !book ? (
          <Card>
            <AppText variant="subtitle">打开失败</AppText>
            <AppText tone="danger" style={styles.gapTop}>
              {error ?? "书籍不存在"}
            </AppText>
          </Card>
        ) : (
          <>
            <Card>
              <AppText variant="title">{book.title}</AppText>
              <AppText tone="muted" style={styles.path}>
                {book.path}
              </AppText>
              {book.description ? (
                <AppText style={styles.description}>{book.description}</AppText>
              ) : null}
            </Card>

            <SectionHeader
              title="章节"
              subtitle={`${chapters.length} 个 Markdown 文件`}
            />
            <View style={styles.chapterList}>
              {chapters.map((chapter) => (
                <Pressable
                  key={chapter.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/chapter/[bookId]/[chapterId]",
                      params: { bookId: book.id, chapterId: chapter.id }
                    })
                  }
                  style={({ pressed }) => [
                    styles.chapterRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.82 : 1
                    }
                  ]}
                >
                  <View style={[styles.chapterIcon, { backgroundColor: colors.surfaceMuted }]}>
                    {chapter.isRead ? (
                      <CheckCircle2 color={colors.success} size={18} />
                    ) : (
                      <FileText color={colors.primary} size={18} />
                    )}
                  </View>
                  <View style={styles.chapterText}>
                    <AppText variant="label" numberOfLines={1}>
                      {chapter.title}
                    </AppText>
                    <AppText variant="caption" tone="muted" numberOfLines={1}>
                      {chapter.fileName}
                    </AppText>
                  </View>
                  <AppText variant="caption" tone="primary">
                    {Math.round(chapter.progress ?? 0)}%
                  </AppText>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16
  },
  topbar: {
    alignItems: "flex-start",
    paddingTop: 8
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 56
  },
  gapTop: {
    marginTop: 8
  },
  path: {
    marginTop: 8
  },
  description: {
    marginTop: 14
  },
  chapterList: {
    gap: 10
  },
  chapterRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chapterIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  chapterText: {
    flex: 1,
    minWidth: 0
  }
});
