export interface Book {
  id: string;
  title: string;
  path: string;
  lastRead: string | Date;
  createdAt?: string | Date;
  coverImage?: string;
  chapters?: Chapter[];
  totalChapters?: number;
  readChapters?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  fileName: string;
  content?: string;
  orderIndex: number;
  isRead: boolean;
  progress: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  children?: Chapter[];
}

export interface SidebarConfig {
  books: Book[];
}

export interface ScanRequest {
  path: string;
}

export interface ScanResponse {
  success: boolean;
  message: string;
  booksScanned?: number;
  chaptersScanned?: number;
}

export interface UpdateProgressRequest {
  progress: number;
}

export interface SearchResult {
  id: string;
  type: 'book' | 'chapter' | 'content';
  title: string;
  content: string;
  score: number;
  bookId: string;
  chapterId?: string;
  bookTitle?: string;
}

export interface AiRuntimeConfig {
  mode: 'local' | 'openai-compatible';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface AiContext {
  bookId?: string;
  chapterId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  selectedText?: string;
}

export interface AiChatRequest {
  message: string;
  context?: AiContext;
  config?: AiRuntimeConfig;
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
  mode: 'local-extractive' | 'openai-compatible';
  model?: string;
  notice?: string;
}
