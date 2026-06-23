import {
  AiChatRequest,
  AiChatResponse,
  Book,
  Chapter,
  ScanResponse,
  SearchResult,
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

export function getChapter(bookId: string, chapterId: string) {
  return fetchJson<Chapter>(`/books/${bookId}/chapters/${chapterId}`, {
    cache: "no-store",
  });
}

export function updateChapterProgress(
  bookId: string,
  chapterId: string,
  progress: number,
) {
  return fetchJson<Chapter>(`/books/${bookId}/chapters/${chapterId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ progress }),
  });
}

export function scanDirectory(path: string) {
  return fetchJson<ScanResponse>("/scan", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function searchLibrary(query: string, bookId?: string) {
  const params = new URLSearchParams({ q: query });
  if (bookId) {
    params.set("bookId", bookId);
  }

  return fetchJson<SearchResult[]>(`/search?${params.toString()}`, {
    cache: "no-store",
  });
}

export function chatWithAI(request: AiChatRequest) {
  return fetchJson<AiChatResponse>("/ai/chat", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
