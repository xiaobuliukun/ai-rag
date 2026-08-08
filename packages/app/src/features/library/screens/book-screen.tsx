import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Pencil,
  Save,
  Trash2,
  X
} from "lucide-react-native";
import type { Book } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import {
  AppText,
  Button,
  Card,
  Field,
  Screen,
  SectionHeader
} from "@/design-system/ui/primitives";
import { sortChapters } from "@/domains/library/models";
import { resolveBookCoverSource } from "@/infrastructure/api/book-assets";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

export function BookScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { colors } = useAppTheme();
  const { settings } = useAppSettings();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [coverDraft, setCoverDraft] = useState("");

  const load = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setError(null);
    try {
      const nextBook = await api.getBook(bookId);
      setBook(nextBook);
      setTitleDraft(nextBook.title);
      setDescriptionDraft(nextBook.description ?? "");
      setTagsDraft((nextBook.tags ?? []).join(", "));
      setCoverDraft(nextBook.coverImage ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取书籍");
    } finally {
      setIsLoading(false);
    }
  }, [api, bookId]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void load();
    }, [load])
  );

  const chapters = sortChapters(book?.chapters ?? []);
  const coverSource = useMemo(
    () =>
      book
        ? resolveBookCoverSource({
            apiBaseUrl: settings.apiBaseUrl,
            apiAccessToken: settings.apiAccessToken,
            bookId: book.id,
            coverImage: book.coverImage
          })
        : undefined,
    [book, settings.apiAccessToken, settings.apiBaseUrl]
  );

  const handleSaveBook = async () => {
    if (!book) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.updateBook(book.id, {
        title: titleDraft.trim(),
        description: descriptionDraft.trim() || null,
        coverImage: coverDraft.trim() || null,
        tags: tagsDraft
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setBook(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存书籍失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBook = () => {
    if (!book) {
      return;
    }

    Alert.alert("删除书籍", `确定从墨序中删除《${book.title}》吗？不会删除原始文件。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setIsSaving(true);
          void api
            .deleteBook(book.id)
            .then(() => router.back())
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "删除书籍失败");
            })
            .finally(() => setIsSaving(false));
        }
      }
    ]);
  };

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
        ) : !book ? (
          <Card>
            <AppText variant="subtitle">打开失败</AppText>
            <AppText tone="danger" style={styles.gapTop}>
              {error ?? "书籍不存在"}
            </AppText>
          </Card>
        ) : (
          <>
            <Card style={styles.bookDetails}>
              {isEditing ? (
                <>
                  <Field
                    value={titleDraft}
                    onChangeText={setTitleDraft}
                    placeholder="书籍标题"
                  />
                  <Field
                    value={descriptionDraft}
                    onChangeText={setDescriptionDraft}
                    placeholder="书籍描述"
                    multiline
                  />
                  <Field
                    value={tagsDraft}
                    onChangeText={setTagsDraft}
                    placeholder="标签，用逗号分隔"
                  />
                  <Field
                    value={coverDraft}
                    onChangeText={setCoverDraft}
                    placeholder="封面 URL、data URL 或书内相对路径"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.bookActions}>
                    <Button
                      title="保存"
                      loading={isSaving}
                      disabled={!titleDraft.trim()}
                      icon={<Save color={colors.primaryForeground} size={16} />}
                      onPress={() => void handleSaveBook()}
                    />
                    <Button
                      title="取消"
                      variant="ghost"
                      icon={<X color={colors.primary} size={16} />}
                      onPress={() => setIsEditing(false)}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.bookHeading}>
                    {coverSource ? (
                      <Image
                        source={coverSource}
                        accessibilityLabel={`${book.title} 封面`}
                        resizeMode="cover"
                        style={[styles.coverImage, { backgroundColor: colors.surfaceMuted }]}
                      />
                    ) : null}
                    <View style={styles.bookHeadingText}>
                      <AppText variant="title">{book.title}</AppText>
                      <AppText tone="muted" style={styles.path}>
                        {book.path}
                      </AppText>
                    </View>
                    <Button
                      title="编辑"
                      variant="secondary"
                      icon={<Pencil color={colors.foreground} size={16} />}
                      onPress={() => setIsEditing(true)}
                    />
                  </View>
                  {book.description ? (
                    <AppText style={styles.description}>{book.description}</AppText>
                  ) : null}
                  {(book.tags ?? []).length > 0 ? (
                    <AppText variant="caption" tone="muted">
                      {(book.tags ?? []).join(" · ")}
                    </AppText>
                  ) : null}
                  <Button
                    title="删除书籍记录"
                    variant="ghost"
                    icon={<Trash2 color={colors.danger} size={16} />}
                    onPress={handleDeleteBook}
                  />
                </>
              )}
            </Card>

            {error ? (
              <Card>
                <AppText tone="danger">{error}</AppText>
              </Card>
            ) : null}

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
  bookDetails: {
    gap: 12
  },
  bookHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  bookHeadingText: {
    flex: 1,
    minWidth: 0
  },
  coverImage: {
    width: 72,
    height: 96,
    borderRadius: 8
  },
  bookActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
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
