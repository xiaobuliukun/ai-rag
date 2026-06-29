"use client";

import * as React from "react";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  Loader2,
  PanelRightClose,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
        "ai-panel-shell fixed right-0 top-0 z-40 flex h-screen max-w-[calc(100vw-1rem)] flex-col border-l shadow-2xl backdrop-blur transition-transform duration-300",
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
      <div className="ai-panel-header flex h-14 items-center justify-between border-b px-4">
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

      <div className="ai-prompt-bar border-b px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {promptKeys.map((promptKey) => (
            <button
              key={promptKey}
              type="button"
              onClick={() => void submit(t(promptKey))}
              disabled={isLoading}
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(promptKey)}
            </button>
          ))}
        </div>
      </div>

      <div ref={messagesRef} className="scrollbar-soft flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="ai-empty-state rounded-lg border p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                {readingContext?.selectedText
                  ? t("ai.selectionCaptured")
                  : readingContext?.chapterTitle
                    ? t("ai.currentChapterReady")
                    : t("ai.noChapter")}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex min-w-0 gap-3",
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
                "ai-message-bubble min-w-0 max-w-[82%] overflow-hidden rounded-lg px-3 py-2 text-sm leading-6",
                message.role === "user"
                  ? "is-user bg-primary text-primary-foreground"
                  : "border",
              )}
            >
              {message.content ? (
                <ChatMarkdown content={message.content} />
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

      <form onSubmit={handleSubmit} className="ai-input-bar border-t p-4">
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

function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-chat-markdown max-w-full overflow-hidden break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          a({ href = "", children }) {
            return (
              <a
                href={href}
                target={href.startsWith("#") ? undefined : "_blank"}
                rel={href.startsWith("#") ? undefined : "noreferrer"}
                className="break-all text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
              >
                {children}
              </a>
            );
          },
          ul({ children }) {
            return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-primary/35 pl-3 text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 max-w-full overflow-x-auto rounded-md border bg-card/70">
                <table className="w-full min-w-max border-collapse text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }) {
            return (
              <th
                className="border-b bg-secondary px-2.5 py-2 text-left font-semibold"
                {...props}
              >
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="border-b px-2.5 py-2 align-top" {...props}>
                {children}
              </td>
            );
          },
          img({ src = "", alt = "" }) {
            return (
              <ChatMarkdownImage
                src={typeof src === "string" ? src : ""}
                alt={String(alt ?? "")}
              />
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          code({
            inline,
            className,
            children,
            ...props
          }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
            const text = React.Children.toArray(children).join("");
            const match = /language-([\w-]+)/.exec(className || "");

            if (!inline && (match || text.includes("\n"))) {
              return (
                <ChatCodeBlock
                  language={match?.[1] ?? "text"}
                  className={className}
                  {...props}
                >
                  {children}
                </ChatCodeBlock>
              );
            }

            return (
              <code
                className={cn(
                  "rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.92em] text-foreground break-words",
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ChatMarkdownImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  const trimmedSrc = src.trim();
  const canRender =
    /^(https?:|data:image\/|blob:|\/)/i.test(trimmedSrc) &&
    !/[\s<>]/.test(trimmedSrc);

  if (!trimmedSrc || failed || !canRender) {
    return (
      <span className="my-2 block rounded-md border border-dashed bg-secondary/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
        图片无法加载
        {alt ? `：${alt}` : ""}
        {trimmedSrc ? (
          <span className="mt-1 block break-all font-mono text-[11px] opacity-75">
            {trimmedSrc}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="my-3 block max-w-full overflow-hidden rounded-md border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmedSrc}
        alt={alt || "Markdown image"}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-h-64 w-full object-contain"
      />
    </span>
  );
}

function ChatCodeBlock({
  language,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & { language: string }) {
  const [copied, setCopied] = React.useState(false);
  const code = React.Children.toArray(children).join("").replace(/\n$/, "");

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="my-3 max-w-full overflow-hidden rounded-md border bg-[hsl(218_20%_12%)] text-[hsl(42_26%_96%)] shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[11px] uppercase text-white/58">
          {language}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border border-white/12 px-2 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="scrollbar-soft max-w-full overflow-x-auto p-3 text-xs leading-5">
        <code
          className={cn("block min-w-0 whitespace-pre font-mono", className)}
          {...props}
        >
          {code}
        </code>
      </pre>
    </div>
  );
}
