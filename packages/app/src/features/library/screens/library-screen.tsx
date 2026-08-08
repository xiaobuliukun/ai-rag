import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertCircle, BookOpen, FolderSearch, RefreshCw, X } from "lucide-react-native";
import type {
  Book,
  LibraryStats,
  ScanJobStatus,
  SearchIndexStatus
} from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { Button, AppText, Card, Field, Screen, SectionHeader } from "@/design-system/ui/primitives";
import { resolveBookCoverSource } from "@/infrastructure/api/book-assets";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";
import { formatDate, formatMinutes } from "@/shared/utils/date";
import { getBookProgress } from "@/domains/library/models";

export function LibraryScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { settings } = useAppSettings();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [indexStatus, setIndexStatus] = useState<SearchIndexStatus | null>(null);
  const [scanPath, setScanPath] = useState("");
  const [scanJob, setScanJob] = useState<ScanJobStatus | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextBooks, nextStats, nextIndexStatus] = await Promise.all([
        api.getBooks(),
        api.getLibraryStats().catch(() => null),
        api.getSearchIndexStatus().catch(() => null)
      ]);
      setBooks(nextBooks);
      setStats(nextStats);
      setIndexStatus(nextIndexStatus);
    } catch (err) {
      setBooks([]);
      setStats(null);
      setIndexStatus(null);
      setError(err instanceof Error ? err.message : "无法连接墨序服务");
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleScan = async () => {
    const path = scanPath.trim();
    if (!path) {
      setError("请输入服务端可访问的书库目录路径");
      return;
    }

    setIsScanning(true);
    setStatus(null);
    setError(null);

    try {
      const { job } = await api.startScanJob(path);
      setScanJob(job);
      const completed = await api.waitForScanJob(job.id, setScanJob);
      if (completed.phase === "failed") {
        throw new Error(completed.error ?? completed.message);
      }
      setStatus(completed.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCancelScan = async () => {
    if (!scanJob) {
      return;
    }

    const { job } = await api.cancelScanJob(scanJob.id);
    setScanJob(job);
  };

  const handleRescan = async () => {
    setIsScanning(true);
    setStatus(null);
    setError(null);

    try {
      const { job } = await api.startRescanKnownBooksJob();
      setScanJob(job);
      const completed = await api.waitForScanJob(job.id, setScanJob);
      if (completed.phase === "failed") {
        throw new Error(completed.error ?? completed.message);
      }
      setStatus(completed.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重扫失败");
    } finally {
      setIsScanning(false);
    }
  };

  const readingMinutes = stats
    ? stats.readingMinutes > 0
      ? stats.readingMinutes
      : stats.estimatedReadingMinutes
    : 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              setIsLoading(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.hero}>
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <BookOpen color={colors.primaryForeground} size={24} />
          </View>
          <View style={styles.heroText}>
            <AppText variant="title">墨序</AppText>
            <AppText tone="muted">本地 Markdown 小册阅读档案</AppText>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="书籍" value={String(stats?.totalBooks ?? books.length)} />
          <StatCard label="章节" value={String(stats?.totalChapters ?? 0)} />
          <StatCard label="已读" value={`${stats?.completionRate ?? 0}%`} />
          <StatCard label="阅读" value={formatMinutes(readingMinutes)} />
        </View>

        <Card style={styles.scanCard}>
          <SectionHeader
            title="添加书库"
            subtitle="路径需要是 API 服务所在机器上的目录"
          />
          <View style={styles.scanRow}>
            <Field
              value={scanPath}
              onChangeText={setScanPath}
              placeholder="/Users/me/books"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.scanField}
            />
            <Button
              title={isScanning ? "扫描中" : "扫描"}
              loading={isScanning}
              onPress={handleScan}
              icon={<FolderSearch color={colors.primaryForeground} size={18} />}
            />
          </View>
          <View style={styles.scanActions}>
            <Button
              title="重扫已添加书籍"
              variant="secondary"
              disabled={isScanning || books.length === 0}
              icon={<RefreshCw color={colors.foreground} size={16} />}
              onPress={() => void handleRescan()}
            />
            {indexStatus ? (
              <AppText variant="caption" tone="muted" style={styles.indexStatus}>
                索引：{indexStatus.ftsChunks}/{indexStatus.totalChunks} 全文，
                {indexStatus.vectorChunks}/{indexStatus.totalChunks} 向量
              </AppText>
            ) : null}
          </View>
          {scanJob && isScanning ? (
            <View style={[styles.jobBox, { backgroundColor: colors.surfaceMuted }]}>
              <View style={styles.jobText}>
                <AppText variant="label">{scanJob.currentBook ?? scanJob.phase}</AppText>
                <AppText variant="caption" tone="muted">
                  {scanJob.booksScanned}/{scanJob.booksTotal} 本，{scanJob.chaptersScanned} 章
                </AppText>
              </View>
              <Button
                variant="ghost"
                title="取消"
                icon={<X color={colors.primary} size={16} />}
                onPress={handleCancelScan}
              />
            </View>
          ) : null}
        </Card>

        {error || status ? (
          <View
            style={[
              styles.notice,
              {
                borderColor: error ? colors.danger : colors.primary,
                backgroundColor: error ? "#fff0ed" : colors.accentMuted
              }
            ]}
          >
            <AlertCircle color={error ? colors.danger : colors.primary} size={18} />
            <AppText tone={error ? "danger" : "primary"} style={styles.noticeText}>
              {error ?? status}
            </AppText>
          </View>
        ) : null}

        <SectionHeader
          title="我的书库"
          subtitle={books.length > 0 ? `最近阅读 ${formatDate(stats?.latestReadAt)}` : "扫描后开始阅读"}
          right={
            <Button
              variant="ghost"
              title="刷新"
              icon={<RefreshCw color={colors.primary} size={16} />}
              onPress={() => {
                setIsLoading(true);
                void load();
              }}
            />
          }
        />

        {isLoading && books.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="muted">正在读取本地档案</AppText>
          </View>
        ) : books.length > 0 ? (
          <View style={styles.bookList}>
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onPress={() =>
                  router.push({
                    pathname: "/book/[bookId]",
                    params: { bookId: book.id }
                  })
                }
              />
            ))}
          </View>
        ) : (
          <Card>
            <AppText variant="subtitle">还没有书籍</AppText>
            <AppText tone="muted" style={styles.emptyText}>
              在上方输入书库目录，墨序会把每个子目录整理成一本书。
            </AppText>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.statCard}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <AppText variant="subtitle" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </Card>
  );
}

function BookCard({ book, onPress }: { book: Book; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { settings } = useAppSettings();
  const progress = getBookProgress(book);
  const coverSource = useMemo(
    () =>
      resolveBookCoverSource({
        apiBaseUrl: settings.apiBaseUrl,
        apiAccessToken: settings.apiAccessToken,
        bookId: book.id,
        coverImage: book.coverImage
      }),
    [
      book.coverImage,
      book.id,
      settings.apiAccessToken,
      settings.apiBaseUrl
    ]
  );

  return (
    <Card>
      <View style={styles.bookHeader}>
        {coverSource ? (
          <Image
            source={coverSource}
            accessibilityLabel={`${book.title} 封面`}
            resizeMode="cover"
            style={[styles.bookCover, { backgroundColor: colors.accentMuted }]}
          />
        ) : (
          <View style={[styles.bookIcon, { backgroundColor: colors.accentMuted }]}>
            <BookOpen color={colors.accent} size={20} />
          </View>
        )}
        <View style={styles.bookTitleBox}>
          <AppText variant="subtitle" numberOfLines={1}>
            {book.title}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {book.path}
          </AppText>
        </View>
      </View>

      <View style={styles.progressRow}>
        <AppText variant="caption" tone="muted">
          {progress.read}/{progress.total} 章
        </AppText>
        <AppText variant="caption" tone="primary">
          {progress.percentage}%
        </AppText>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${progress.percentage}%` }
          ]}
        />
      </View>
      <View style={styles.bookFooter}>
        <AppText variant="caption" tone="muted">
          最近 {formatDate(book.lastRead)}
        </AppText>
        <Button title="打开" variant="secondary" onPress={onPress} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  heroText: {
    flex: 1
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    gap: 4
  },
  scanCard: {
    gap: 12
  },
  scanRow: {
    gap: 10
  },
  scanField: {
    flex: 1
  },
  scanActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10
  },
  indexStatus: {
    flex: 1,
    minWidth: 180
  },
  jobBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    padding: 10
  },
  jobText: {
    flex: 1
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12
  },
  noticeText: {
    flex: 1
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 48
  },
  bookList: {
    gap: 12
  },
  bookHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  bookIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  bookCover: {
    width: 44,
    height: 58,
    borderRadius: 8
  },
  bookTitleBox: {
    flex: 1,
    minWidth: 0
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16
  },
  progressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: 999,
    marginTop: 7
  },
  progressFill: {
    height: "100%",
    borderRadius: 999
  },
  bookFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14
  },
  emptyText: {
    marginTop: 8
  }
});
