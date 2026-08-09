import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { BookOpen, FileText, Search, TextSearch } from "lucide-react-native";
import type { SearchResult, SearchResultType } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Field, Screen, SectionHeader } from "@/design-system/ui/primitives";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

const searchTypes: { value: SearchResultType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "book", label: "书籍" },
  { value: "chapter", label: "章节" },
  { value: "content", label: "正文" }
];

export function SearchScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { settings } = useAppSettings();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchResultType>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);
      api
        .searchLibrary(keyword, type)
        .then((nextResults) => {
          if (!cancelled) {
            setResults(nextResults);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setResults([]);
            setError(err instanceof Error ? err.message : "搜索失败");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 360);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, query, type]);

  const openResult = (result: SearchResult) => {
    if (result.chapterId) {
      router.push({
        pathname: "/chapter/[bookId]/[chapterId]",
        params: { bookId: result.bookId, chapterId: result.chapterId }
      });
      return;
    }

    router.push({
      pathname: "/book/[bookId]",
      params: { bookId: result.bookId }
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader
          title="全库搜索"
          subtitle="书名、章节与正文内容会一起匹配"
        />

        <Card style={styles.searchCard}>
          <View style={styles.searchBox}>
            <Search color={colors.muted} size={18} />
            <Field
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                if (!value.trim()) {
                  setResults([]);
                  setError(null);
                  setIsLoading(false);
                }
              }}
              placeholder="输入关键词"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchField}
            />
          </View>
          <View style={styles.typeRow}>
            {searchTypes.map((option) => (
              <Button
                key={option.value}
                title={option.label}
                variant={type === option.value ? "primary" : "secondary"}
                onPress={() => setType(option.value)}
                style={styles.typeButton}
              />
            ))}
          </View>
        </Card>

        {error ? (
          <Card>
            <AppText tone="danger">{error}</AppText>
          </Card>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="muted">正在搜索</AppText>
          </View>
        ) : results.length > 0 ? (
          <View style={styles.resultList}>
            {results.map((result) => (
              <ResultRow
                key={`${result.type}-${result.id}`}
                result={result}
                onPress={() => openResult(result)}
              />
            ))}
          </View>
        ) : (
          <Card style={styles.empty}>
            <TextSearch color={colors.muted} size={28} />
            <AppText variant="subtitle">
              {query.trim() ? "没有匹配结果" : "开始一次搜索"}
            </AppText>
            <AppText tone="muted" style={styles.emptyText}>
              适合找概念、函数名、章节标题，或让 AI 的资料范围更容易被定位。
            </AppText>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function ResultRow({ result, onPress }: { result: SearchResult; onPress: () => void }) {
  const { colors } = useAppTheme();
  const Icon =
    result.type === "book" ? BookOpen : result.type === "chapter" ? FileText : TextSearch;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultRow,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.82 : 1
        }
      ]}
    >
      <View style={[styles.resultIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Icon color={colors.primary} size={18} />
      </View>
      <View style={styles.resultText}>
        <View style={styles.resultTitleLine}>
          <AppText variant="label" numberOfLines={1} style={styles.resultTitle}>
            {result.title}
          </AppText>
          <AppText variant="caption" tone="primary">
            {Math.round(result.score)}
          </AppText>
        </View>
        {result.bookTitle && result.type !== "book" ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {result.bookTitle}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted" numberOfLines={3} style={styles.resultContent}>
          {stripHighlight(result.content)}
        </AppText>
      </View>
    </Pressable>
  );
}

function stripHighlight(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16
  },
  searchCard: {
    gap: 12
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  searchField: {
    flex: 1
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  typeButton: {
    flexGrow: 1
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 44
  },
  resultList: {
    gap: 10
  },
  resultRow: {
    minHeight: 82,
    flexDirection: "row",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  resultText: {
    flex: 1,
    minWidth: 0
  },
  resultTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  resultTitle: {
    flex: 1
  },
  resultContent: {
    marginTop: 5
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 34
  },
  emptyText: {
    textAlign: "center"
  }
});
