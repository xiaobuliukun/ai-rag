"use client";

import * as React from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Check, Copy } from "lucide-react";
import { ComponentPropsWithoutRef, CSSProperties } from "react";
import { getBookAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MarkdownReaderProps {
  content: string;
  bookId?: string;
  chapterFileName?: string;
  className?: string;
  style?: CSSProperties;
}

export function MarkdownReader({
  content,
  bookId,
  chapterFileName,
  className,
  style,
}: MarkdownReaderProps) {
  return (
    <div className={cn("max-w-3xl mx-auto py-8", className)}>
      <article
        className="prose prose-zinc dark:prose-invert lg:prose-lg max-w-none"
        style={style}
      >
        <ReactMarkdown
          components={{
            code({
              inline,
              className,
              children,
              ...props
            }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline && match ? (
                <CodeBlock language={match[1]} className={className} {...props}>
                  {children}
                </CodeBlock>
              ) : (
                <code
                  className={cn(
                    "bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary",
                    className,
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            img({ src = "", alt = "" }) {
              const resolvedSrc = resolveMarkdownImageSrc(
                typeof src === "string" ? src : "",
                bookId,
                chapterFileName,
              );

              if (!resolvedSrc) {
                return null;
              }

              return (
                <span className="my-6 block overflow-hidden rounded-lg border bg-card">
                  <Image
                    src={resolvedSrc}
                    alt={typeof alt === "string" ? alt : ""}
                    width={960}
                    height={540}
                    sizes="(max-width: 768px) 100vw, 768px"
                    unoptimized
                    className="h-auto w-full object-contain"
                  />
                </span>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function CodeBlock({
  language,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & { language: string }) {
  const [copied, setCopied] = React.useState(false);
  const text = React.Children.toArray(children).join("");

  const copyCode = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-wide">{language}</span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 font-medium transition-colors hover:text-primary"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function resolveMarkdownImageSrc(
  src: string,
  bookId?: string,
  chapterFileName?: string,
) {
  if (!src) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(src)) {
    return src;
  }

  if (!bookId) {
    return src;
  }

  const rootRelativePath = src.startsWith("/")
    ? src.slice(1)
    : normalizeRelativePath(
        [
          ...(chapterFileName?.split("/").slice(0, -1) ?? []),
          ...src.split("/"),
        ].join("/"),
      );

  return getBookAssetUrl(bookId, rootRelativePath);
}

function normalizeRelativePath(filePath: string) {
  const parts: string[] = [];

  for (const part of filePath.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}
