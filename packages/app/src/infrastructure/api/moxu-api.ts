import type {
  AiChatRequest,
  AiChatResponse,
  AiRuntimeConfig,
  Book,
  Chapter,
  LibraryStats,
  PersistedAiConfig,
  ScanJobResponse,
  ScanJobStatus,
  SearchResult,
  SearchResultType
} from "@moxu/shared";
import { createApiClient } from "@/infrastructure/api/client";

export function createMoxuApi(baseUrl: string) {
  const client = createApiClient(baseUrl);

  return {
    getStatus: () => client.request<{ status: string; timestamp: string }>("/health"),
    getBooks: () => client.request<Book[]>("/books"),
    getBook: (bookId: string) => client.request<Book>(`/books/${bookId}`),
    getLibraryStats: () => client.request<LibraryStats>("/books/stats"),
    getChapter: (bookId: string, chapterId: string) =>
      client.request<Chapter>(`/books/${bookId}/chapters/${chapterId}`),
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
      })
  };
}
