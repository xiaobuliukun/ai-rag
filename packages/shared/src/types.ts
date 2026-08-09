export interface Book {
  id: string;
  title: string;
  path: string;
  description?: string | null;
  tags?: string[];
  lastRead: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  coverImage?: string | null;
  chapters?: Chapter[];
  totalChapters?: number;
  readChapters?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  fileName: string;
  content?: string | null;
  orderIndex: number;
  isRead: boolean;
  progress: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  readingProgress?: ReadingProgress | null;
  children?: Chapter[];
}

export interface ReadingProgress {
  id: string;
  chapterId: string;
  scrollPosition: number;
  percentage: number;
  readingSeconds: number;
  updatedAt: string | Date;
}

export interface LibraryStats {
  totalBooks: number;
  totalChapters: number;
  completedChapters: number;
  inProgressChapters: number;
  readingSeconds: number;
  readingMinutes: number;
  estimatedReadingMinutes: number;
  learningDays: number;
  completionRate: number;
  latestReadAt?: string | Date | null;
}

export interface SidebarConfig {
  books: Book[];
}

export interface ApiConnectionConfig {
  apiBaseUrl: string;
  apiAccessToken?: string;
}

export interface ScanRequest {
  path: string;
}

export interface ScanResponse {
  success: boolean;
  message: string;
  booksScanned?: number;
  chaptersScanned?: number;
  skippedBooks?: number;
}

export interface UpdateProgressRequest {
  progress: number;
  scrollPosition?: number;
  readingSecondsDelta?: number;
}

export interface UpdateBookRequest {
  title?: string;
  description?: string | null;
  tags?: string[];
  coverImage?: string | null;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  note: string;
  excerpt?: string | null;
  position: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  bookTitle?: string;
  chapterTitle?: string;
}

export interface CreateBookmarkRequest {
  bookId: string;
  chapterId: string;
  note: string;
  excerpt?: string;
  position?: number;
}

export interface UpdateBookmarkRequest {
  note?: string;
  excerpt?: string | null;
  position?: number;
}

export type SearchResultType = "all" | "book" | "chapter" | "content";
export type AiEmbeddingProvider = "local" | "openai-compatible";

export interface SearchResult {
  id: string;
  type: "book" | "chapter" | "content";
  title: string;
  content: string;
  highlightedContent?: string;
  score: number;
  bookId: string;
  chapterId?: string;
  bookTitle?: string;
}

export interface SearchIndexStatus {
  totalBooks: number;
  totalChapters: number;
  totalChunks: number;
  ftsChunks: number;
  vectorChunks: number;
  isFtsReady: boolean;
  isVectorReady: boolean;
  embeddingProvider?: AiEmbeddingProvider;
  embeddingModel?: string;
}

export interface AiRuntimeConfig {
  mode: "local" | "openai-compatible";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  embeddingProvider?: AiEmbeddingProvider;
  embeddingModel?: string;
  ragSourceCount?: number;
  ragContextChars?: number;
  ragExcerptChars?: number;
}

export interface AiConfigUpdateRequest extends AiRuntimeConfig {
  /** Explicitly remove the server-side API key. Empty or omitted apiKey keeps it. */
  clearApiKey?: boolean;
}

export interface PersistedAiConfig extends Omit<AiRuntimeConfig, "apiKey"> {
  id: string;
  hasApiKey: boolean;
  maskedApiKey?: string;
  updatedAt?: string | Date;
}

/** Backup-only shape. apiKey is accepted for legacy imports but never exported. */
export interface BackupAiConfig extends AiRuntimeConfig {
  id: string;
  updatedAt?: string | Date;
}

export interface AiContext {
  bookId?: string;
  chapterId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  selectedText?: string;
}

export interface AiChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  message: string;
  context?: AiContext;
  config?: AiRuntimeConfig;
  history?: AiChatHistoryMessage[];
}

export interface AiSource {
  id: string;
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  excerpt: string;
  relevance: number;
}

export interface AiChatResponse {
  answer: string;
  sources: AiSource[];
  mode: "local-extractive" | "openai-compatible";
  model?: string;
  notice?: string;
}

export type AiChatStreamEvent =
  | {
      type: "meta";
      sources: AiSource[];
      mode: AiChatResponse["mode"];
      model?: string;
    }
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "notice";
      notice: string;
    }
  | {
      type: "done";
      response: AiChatResponse;
    }
  | {
      type: "error";
      message: string;
    };

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  books: Array<
    Book & {
      chapters: Array<
        Chapter & {
          chunks?: Array<{
            chunkIndex: number;
            content: string;
            charCount: number;
          }>;
        }
      >;
    }
  >;
  bookmarks: Bookmark[];
  aiConfig?: BackupAiConfig | null;
  clientPreferences?: ClientPreferencesBackup | null;
}

export interface ClientPreferencesBackup {
  moxuPreferences?: unknown;
  theme?: string | null;
}

export type ImportBackupMode = "merge" | "replace";

export const REPLACE_BACKUP_CONFIRMATION = "replace-current-library" as const;
export type ReplaceBackupConfirmation = typeof REPLACE_BACKUP_CONFIRMATION;

export interface ImportBackupRequest {
  payload: BackupPayload;
  mode?: ImportBackupMode;
  replaceConfirmation?: ReplaceBackupConfirmation;
}

export interface ImportBackupResponse {
  success: boolean;
  indexPending: boolean;
  message: string;
  booksImported: number;
  chaptersImported: number;
  bookmarksImported: number;
}

export type ScanJobPhase =
  | "queued"
  | "scanning"
  | "indexing"
  | "cancelled"
  | "completed"
  | "failed";

export interface ScanJobStatus {
  id: string;
  phase: ScanJobPhase;
  success: boolean;
  message: string;
  rootPath?: string;
  booksTotal: number;
  booksScanned: number;
  chaptersScanned: number;
  skippedBooks: number;
  currentBook?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ScanJobResponse {
  job: ScanJobStatus;
}
