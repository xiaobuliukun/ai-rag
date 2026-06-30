"use client";

import * as React from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { ComponentPropsWithoutRef, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { resolveMarkdownImageSrc } from "@/lib/markdown-images";
import { useI18n } from "@/lib/i18n";

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
          remarkPlugins={[remarkGfm]}
          components={{
            table({ children }) {
              return (
                <div className="my-6 overflow-x-auto rounded-lg border">
                  <table className="m-0 w-full border-collapse text-sm">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children, ...props }) {
              return (
                <th
                  className="border-b bg-secondary px-3 py-2 text-left font-semibold"
                  {...props}
                >
                  {children}
                </th>
              );
            },
            td({ children, ...props }) {
              return (
                <td className="border-b px-3 py-2 align-top" {...props}>
                  {children}
                </td>
              );
            },
            input({ className, ...props }) {
              return (
                <input
                  className={cn("mr-2 align-middle accent-primary", className)}
                  {...props}
                  disabled
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

              return <MarkdownImage src={resolvedSrc} alt={String(alt ?? "")} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = React.useState(false);

  if (!src) {
    return null;
  }

  return (
    <span className="my-6 block overflow-hidden rounded-lg border bg-card">
      {failed ? (
        <span className="block bg-muted px-4 py-5 text-sm text-muted-foreground">
          {alt || t("reader.imageLabel")} · {src}
        </span>
      ) : (
        <Image
          src={src}
          alt={alt}
          width={960}
          height={540}
          sizes="(max-width: 768px) 100vw, 768px"
          unoptimized
          onError={() => setFailed(true)}
          className="h-auto w-full object-contain"
        />
      )}
    </span>
  );
}

function CodeBlock({
  language,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & { language: string }) {
  const [copied, setCopied] = React.useState(false);
  const { t } = useI18n();
  const text = React.Children.toArray(children).join("").replace(/\n$/, "");
  const highlighted = React.useMemo(
    () => highlightCode(text, language),
    [language, text],
  );
  const lineCount = Math.max(1, text.split("\n").length);

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
          {copied ? t("ai.copied") : t("ai.copy")}
        </button>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden">
        <div
          aria-hidden="true"
          className="select-none border-r bg-background/40 px-3 py-4 text-right font-mono text-xs leading-6 text-muted-foreground"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-6">
          <code
            className={cn("block min-w-full font-mono", className)}
            dangerouslySetInnerHTML={{ __html: highlighted }}
            {...props}
          />
        </pre>
      </div>
    </div>
  );
}

type TokenPattern = {
  className: string;
  regex: RegExp;
};

const commonKeywords = [
  'abstract',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'while',
  'yield',
].join('|');

function highlightCode(code: string, language: string) {
  const normalizedLanguage = language.toLowerCase();

  if (['json', 'jsonc'].includes(normalizedLanguage)) {
    return tokenize(code, [
      { className: 'syntax-property', regex: /"(?:\\.|[^"\\])*"(?=\s*:)/g },
      { className: 'syntax-string', regex: /"(?:\\.|[^"\\])*"/g },
      { className: 'syntax-number', regex: /-?\b\d+(?:\.\d+)?\b/g },
      { className: 'syntax-keyword', regex: /\b(?:true|false|null)\b/g },
      { className: 'syntax-punctuation', regex: /[{}\[\],:]/g },
    ]);
  }

  if (['css', 'scss'].includes(normalizedLanguage)) {
    return tokenize(code, [
      { className: 'syntax-comment', regex: /\/\*[\s\S]*?\*\//g },
      { className: 'syntax-property', regex: /[a-z-]+(?=\s*:)/gi },
      { className: 'syntax-string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
      { className: 'syntax-number', regex: /-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b/g },
      { className: 'syntax-keyword', regex: /#[0-9a-f]{3,8}\b|var\(--[^)]+\)|\b(?:calc|clamp|min|max|rgb|rgba|hsl|hsla|color-mix)\b/gi },
      { className: 'syntax-punctuation', regex: /[{}();,:]/g },
    ]);
  }

  if (['bash', 'sh', 'shell', 'zsh'].includes(normalizedLanguage)) {
    return tokenize(code, [
      { className: 'syntax-comment', regex: /#.*/g },
      { className: 'syntax-string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
      { className: 'syntax-keyword', regex: /\b(?:cd|cp|curl|echo|export|git|mkdir|npm|pnpm|rm|yarn)\b/g },
      { className: 'syntax-property', regex: /\s--?[a-z0-9-]+/gi },
    ]);
  }

  if (['md', 'markdown'].includes(normalizedLanguage)) {
    return tokenize(code, [
      { className: 'syntax-keyword', regex: /^#{1,6}\s.+$/gm },
      { className: 'syntax-string', regex: /`[^`]+`|\*\*[^*]+\*\*/g },
      { className: 'syntax-property', regex: /\[[^\]]+\]\([^)]+\)/g },
    ]);
  }

  return tokenize(code, [
    { className: 'syntax-comment', regex: /\/\/.*|\/\*[\s\S]*?\*\//g },
    { className: 'syntax-string', regex: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
    {
      className: 'syntax-keyword',
      regex: new RegExp(`\\b(?:${commonKeywords})\\b`, 'g'),
    },
    { className: 'syntax-number', regex: /-?\b\d+(?:\.\d+)?\b/g },
    { className: 'syntax-property', regex: /\b[A-Za-z_$][\w$]*(?=\s*:)/g },
    { className: 'syntax-punctuation', regex: /[{}\[\]();,.<>]/g },
  ]);
}

function tokenize(code: string, patterns: TokenPattern[]) {
  const matches: Array<{
    index: number;
    end: number;
    className: string;
    value: string;
  }> = [];

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of code.matchAll(pattern.regex)) {
      if (match.index === undefined) {
        continue;
      }
      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        className: pattern.className,
        value: match[0],
      });
    }
  }

  matches.sort((left, right) => left.index - right.index || right.end - left.end);

  let cursor = 0;
  let html = '';
  for (const match of matches) {
    if (match.index < cursor) {
      continue;
    }
    html += escapeHtml(code.slice(cursor, match.index));
    html += `<span class="${match.className}">${escapeHtml(match.value)}</span>`;
    cursor = match.end;
  }

  html += escapeHtml(code.slice(cursor));
  return html;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
