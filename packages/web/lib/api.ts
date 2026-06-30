import {
  AiChatRequest,
  AiChatResponse,
  AiChatStreamEvent,
  AiRuntimeConfig,
  Book,
  Bookmark,
  BackupPayload,
  Chapter,
  CreateBookmarkRequest,
  ImportBackupMode,
  ImportBackupResponse,
  LibraryStats,
  PersistedAiConfig,
  ScanJobResponse,
  ScanJobStatus,
  ScanResponse,
  SearchIndexStatus,
  SearchResult,
  SearchResultType,
  UpdateBookRequest,
  UpdateBookmarkRequest,
} from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

type ApiInit = RequestInit & {
  cache?: RequestCache;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload?.message === "string") {
      return payload.message;
    }
    if (Array.isArray(payload?.message)) {
      return payload.message.join(", ");
    }
  } catch {
    // Fall through to the status text below.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

export async function fetchJson<T>(path: string, init?: ApiInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

export function getBooks() {
  return fetchJson<Book[]>("/books", { cache: "no-store" });
}

export function getBook(bookId: string) {
  return fetchJson<Book>(`/books/${bookId}`, { cache: "no-store" });
}

export function getLibraryStats() {
  return fetchJson<LibraryStats>("/books/stats", { cache: "no-store" });
}

export function getChapter(bookId: string, chapterId: string) {
  return fetchJson<Chapter>(`/books/${bookId}/chapters/${chapterId}`, {
    cache: "no-store",
  });
}

export function updateChapterProgress(
  bookId: string,
  chapterId: string,
  progress: number,
  scrollPosition = 0,
  readingSecondsDelta = 0,
) {
  return fetchJson<Chapter>(`/books/${bookId}/chapters/${chapterId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ progress, scrollPosition, readingSecondsDelta }),
  });
}

export function updateBook(bookId: string, request: UpdateBookRequest) {
  return fetchJson<Book>(`/books/${bookId}`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function deleteBook(bookId: string) {
  return fetchJson<{ success: boolean }>(`/books/${bookId}`, {
    method: "DELETE",
  });
}

export function scanDirectory(path: string) {
  return fetchJson<ScanResponse>("/scan", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function rescanKnownBooks() {
  return fetchJson<ScanResponse>("/scan/rescan-known", {
    method: "POST",
  });
}

export function startScanJob(path: string) {
  return fetchJson<ScanJobResponse>("/scan/jobs", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function startRescanKnownBooksJob() {
  return fetchJson<ScanJobResponse>("/scan/rescan-known/jobs", {
    method: "POST",
  });
}

export function getScanJob(jobId: string) {
  return fetchJson<ScanJobResponse>(`/scan/jobs/${jobId}`, {
    cache: "no-store",
  });
}

export function cancelScanJob(jobId: string) {
  return fetchJson<ScanJobResponse>(`/scan/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}

export async function waitForScanJob(
  jobId: string,
  onUpdate: (job: ScanJobStatus) => void,
  intervalMs = 750,
) {
  while (true) {
    const { job } = await getScanJob(jobId);
    onUpdate(job);

    if (
      job.phase === "completed" ||
      job.phase === "failed" ||
      job.phase === "cancelled"
    ) {
      return job;
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export function searchLibrary(
  query: string,
  bookId?: string,
  type: SearchResultType = "all",
  init?: ApiInit,
) {
  const params = new URLSearchParams({ q: query });
  if (bookId) {
    params.set("bookId", bookId);
  }
  if (type !== "all") {
    params.set("type", type);
  }

  return fetchJson<SearchResult[]>(`/search?${params.toString()}`, {
    cache: "no-store",
    ...init,
  });
}

export function getSearchIndexStatus() {
  return fetchJson<SearchIndexStatus>("/search/index-status", {
    cache: "no-store",
  });
}

export function chatWithAI(request: AiChatRequest) {
  return fetchJson<AiChatResponse>("/ai/chat", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getAIConfig() {
  return fetchJson<PersistedAiConfig>("/ai/config", { cache: "no-store" });
}

export function saveAIConfig(config: AiRuntimeConfig) {
  return fetchJson<PersistedAiConfig>("/ai/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function getBookmarks(bookId?: string, chapterId?: string) {
  const params = new URLSearchParams();
  if (bookId) {
    params.set("bookId", bookId);
  }
  if (chapterId) {
    params.set("chapterId", chapterId);
  }

  const query = params.toString();
  return fetchJson<Bookmark[]>(`/bookmarks${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
}

export function createBookmark(request: CreateBookmarkRequest) {
  return fetchJson<Bookmark>("/bookmarks", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateBookmark(id: string, request: UpdateBookmarkRequest) {
  return fetchJson<Bookmark>(`/bookmarks/${id}`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function deleteBookmark(id: string) {
  return fetchJson<{ success: boolean }>(`/bookmarks/${id}`, {
    method: "DELETE",
  });
}

export function exportBackup() {
  return fetchJson<BackupPayload>("/backup/export", { cache: "no-store" });
}

export function importBackup(
  payload: BackupPayload,
  mode: ImportBackupMode = "merge",
) {
  return fetchJson<ImportBackupResponse>("/backup/import", {
    method: "POST",
    body: JSON.stringify({ payload, mode }),
  });
}

export function getBookAssetUrl(bookId: string, filePath: string) {
  const params = new URLSearchParams({ path: filePath });
  return `${API_BASE_URL}/assets/books/${bookId}/files?${params.toString()}`;
}

export async function streamChatWithAI(
  request: AiChatRequest,
  onEvent: (event: AiChatStreamEvent) => void,
) {
  const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  if (!response.body) {
    throw new Error("AI stream response did not include a body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const parsed = parseSseEvent(event);
        if (parsed) {
          onEvent(parsed);
        }
      }
    }

    buffer += decoder.decode();
    const parsed = parseSseEvent(buffer);
    if (parsed) {
      onEvent(parsed);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(event: string) {
  const data = event
    .split("\n")
    .find((line) => line.startsWith("data:"))
    ?.slice(5)
    .trim();

  if (!data) {
    return null;
  }

  return JSON.parse(data) as AiChatStreamEvent;
}
