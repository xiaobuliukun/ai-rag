import type {
  AiChatRequest,
  AiChatResponse,
  AiRuntimeConfig,
  Book,
  Bookmark,
  Chapter,
  CreateBookmarkRequest,
  LibraryStats,
  PersistedAiConfig,
  ScanJobResponse,
  ScanJobStatus,
  SearchIndexStatus,
  SearchResult,
  SearchResultType,
  UpdateBookRequest
} from "@moxu/shared";
import { createApiClient } from "@/infrastructure/api/client";

export function createMoxuApi(baseUrl: string, accessToken?: string) {
  const client = createApiClient(baseUrl, accessToken);

  return {
    getStatus: () => client.request<{ status: string; timestamp: string }>("/health"),
    getBooks: () => client.request<Book[]>("/books"),
    getBook: (bookId: string) => client.request<Book>(`/books/${bookId}`),
    updateBook: (bookId: string, request: UpdateBookRequest) =>
      client.request<Book>(`/books/${bookId}`, {
        method: "PUT",
        body: JSON.stringify(request)
      }),
    deleteBook: (bookId: string) =>
      client.request<{ success: boolean }>(`/books/${bookId}`, {
        method: "DELETE"
      }),
    getLibraryStats: () => client.request<LibraryStats>("/books/stats"),
    getChapter: (bookId: string, chapterId: string) =>
      client.request<Chapter>(`/books/${bookId}/chapters/${chapterId}`),
    getBookmarks: (bookId?: string, chapterId?: string) => {
      const params = new URLSearchParams();
      if (bookId) {
        params.set("bookId", bookId);
      }
      if (chapterId) {
        params.set("chapterId", chapterId);
      }
      const query = params.toString();
      return client.request<Bookmark[]>(`/bookmarks${query ? `?${query}` : ""}`);
    },
    createBookmark: (request: CreateBookmarkRequest) =>
      client.request<Bookmark>("/bookmarks", {
        method: "POST",
        body: JSON.stringify(request)
      }),
    deleteBookmark: (id: string) =>
      client.request<{ success: boolean }>(`/bookmarks/${id}`, {
        method: "DELETE"
      }),
    updateChapterProgress: (
      bookId: string,
      chapterId: string,
      progress: number,
      scrollPosition = 0,
      readingSecondsDelta = 0
    ) =>
      client.request<Chapter>(`/books/${bookId}/chapters/${chapterId}/progress`, {
        method: "PUT",
        body: JSON.stringify({ progress, scrollPosition, readingSecondsDelta })
      }),
    searchLibrary: (
      query: string,
      type: SearchResultType = "all",
      bookId?: string
    ) => {
      const params = new URLSearchParams({ q: query });
      if (type !== "all") {
        params.set("type", type);
      }
      if (bookId) {
        params.set("bookId", bookId);
      }
      return client.request<SearchResult[]>(`/search?${params.toString()}`);
    },
    startScanJob: (path: string) =>
      client.request<ScanJobResponse>("/scan/jobs", {
        method: "POST",
        body: JSON.stringify({ path })
      }),
    startRescanKnownBooksJob: () =>
      client.request<ScanJobResponse>("/scan/rescan-known/jobs", {
        method: "POST"
      }),
    getScanJob: (jobId: string) =>
      client.request<ScanJobResponse>(`/scan/jobs/${jobId}`),
    cancelScanJob: (jobId: string) =>
      client.request<ScanJobResponse>(`/scan/jobs/${jobId}/cancel`, {
        method: "POST"
      }),
    waitForScanJob: async (
      jobId: string,
      onUpdate: (job: ScanJobStatus) => void
    ) => {
      while (true) {
        const { job } = await client.request<ScanJobResponse>(`/scan/jobs/${jobId}`);
        onUpdate(job);
        if (["completed", "failed", "cancelled"].includes(job.phase)) {
          return job;
        }
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
    },
    chatWithAI: (request: AiChatRequest) =>
      client.request<AiChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify(request)
      }),
    getAIConfig: () => client.request<PersistedAiConfig>("/ai/config"),
    saveAIConfig: (config: AiRuntimeConfig) =>
      client.request<PersistedAiConfig>("/ai/config", {
        method: "PUT",
        body: JSON.stringify(config)
      }),
    getSearchIndexStatus: () =>
      client.request<SearchIndexStatus>("/search/index-status")
  };
}
