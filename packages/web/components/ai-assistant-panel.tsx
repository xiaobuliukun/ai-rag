"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  ExternalLink,
  GripVertical,
  Loader2,
  PanelRightClose,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AiChatResponse, AiSource } from "@/types";
import { streamChatWithAI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { useI18n } from "@/lib/i18n";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AiChatResponse;
  sources?: AiSource[];
  notice?: string;
  isStreaming?: boolean;
};

const promptKeys = ["ai.summarize", "ai.explain", "ai.quizMe"] as const;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 640;
const PANEL_VIEWPORT_GUTTER = 64;

function clampPanelWidth(width: number) {
  if (typeof window === "undefined") {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
  }

  const viewportMax = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, window.innerWidth - PANEL_VIEWPORT_GUTTER),
  );
  return Math.min(viewportMax, Math.max(MIN_PANEL_WIDTH, width));
}

export function AIAssistantPanel() {
  const { t } = useI18n();
  const isAIPanelOpen = useStore((state) => state.isAIPanelOpen);
  const toggleAIPanel = useStore((state) => state.toggleAIPanel);
  const aiPanelWidth = useStore((state) => state.aiPanelWidth);
  const setAIPanelWidth = useStore((state) => state.setAIPanelWidth);
  const readingContext = useStore((state) => state.readingContext);
  const aiConfig = useStore((state) => state.aiConfig);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  const submit = async (message: string) => {
    const content = message.trim();
    if (!content || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      await streamChatWithAI(
        {
          message: content,
          context: readingContext,
          config: aiConfig,
        },
        (event) => {
          if (event.type === "error") {
            throw new Error(event.message);
          }

          setMessages((current) =>
            current.map((currentMessage) => {
              if (currentMessage.id !== assistantMessageId) {
                return currentMessage;
              }

              if (event.type === "meta") {
                return {
                  ...currentMessage,
                  sources: event.sources,
                };
              }

              if (event.type === "notice") {
                return {
                  ...currentMessage,
                  notice: event.notice,
                };
              }

              if (event.type === "delta") {
                return {
                  ...currentMessage,
                  content: `${currentMessage.content}${event.delta}`,
                };
              }

              return {
                ...currentMessage,
                content: event.response.answer,
                response: event.response,
                sources: event.response.sources,
                notice: event.response.notice,
                isStreaming: false,
              };
            }),
          );
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ai.requestFailed");
      setError(t("ai.requestFailedWithMessage", { message }));
      setMessages((current) =>
        current.map((currentMessage) =>
          currentMessage.id === assistantMessageId
            ? { ...currentMessage, isStreaming: false }
            : currentMessage,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(input);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isResizing) {
      return;
    }

    setAIPanelWidth(clampPanelWidth(window.innerWidth - event.clientX));
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isResizing) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsResizing(false);
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-40 flex h-screen max-w-[calc(100vw-1rem)] flex-col border-l bg-card shadow-xl transition-transform duration-300",
        isAIPanelOpen ? "translate-x-0" : "translate-x-full",
      )}
      style={{ width: aiPanelWidth }}
    >
      <button
        type="button"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        className={cn(
          "absolute left-0 top-0 flex h-full w-4 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center text-muted-foreground/70 outline-none transition-colors hover:text-primary focus-visible:text-primary",
          isResizing && "text-primary",
        )}
        aria-label={t("ai.resizePanel")}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={aiPanelWidth}
      >
        <span className="flex h-14 w-2 items-center justify-center rounded-full bg-border/80 shadow-sm">
          <GripVertical className="h-4 w-4" />
        </span>
      </button>
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">{t("ai.title")}</div>
            <div className="truncate text-xs text-muted-foreground">
              {readingContext?.chapterTitle ?? t("ai.libraryContext")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleAIPanel}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t("ai.closePanel")}
        >
          <PanelRightClose className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {promptKeys.map((promptKey) => (
            <button
              key={promptKey}
              type="button"
              onClick={() => void submit(t(promptKey))}
              disabled={isLoading}
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(promptKey)}
            </button>
          ))}
        </div>
      </div>

      <div ref={messagesRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
            {readingContext?.selectedText
              ? t("ai.selectionCaptured")
              : readingContext?.chapterTitle
                ? t("ai.currentChapterReady")
                : t("ai.noChapter")}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "justify-end",
            )}
          >
            {message.role === "assistant" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background",
              )}
            >
              {message.content ? (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              ) : message.isStreaming ? (
                <span className="text-muted-foreground">{t("ai.thinking")}</span>
              ) : null}
              {message.isStreaming && message.content && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-primary align-middle" />
              )}
              {(message.response?.notice || message.notice) && (
                <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {message.response?.notice ?? message.notice}
                </div>
              )}
              {(message.response?.sources.length || message.sources?.length) ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("ai.sources")}
                  </div>
                  {(message.response?.sources ?? message.sources ?? []).map((source, index) => (
                    <Link
                      key={source.id}
                      href={`/book/${source.bookId}/${source.chapterId}`}
                      className="block rounded-md bg-secondary/60 px-2 py-1.5 text-xs transition-colors hover:bg-secondary"
                    >
                      <div className="flex items-center justify-between gap-2 font-medium">
                        <span className="truncate">
                          [{index + 1}] {source.chapterTitle}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {source.bookTitle}
                      </div>
                      <div className="mt-1 line-clamp-3 text-muted-foreground/90">
                        {source.excerpt}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            {message.role === "user" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && !messages.some((message) => message.isStreaming) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("ai.thinking")}
          </div>
        )}

        {error && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder={t("ai.ask")}
            className="min-h-11 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t("ai.send")}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </aside>
  );
}
