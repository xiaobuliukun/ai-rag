import ReactMarkdown from "react-markdown";
import { ComponentPropsWithoutRef, CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface MarkdownReaderProps {
  content: string;
  className?: string;
  style?: CSSProperties;
}

export function MarkdownReader({ content, className, style }: MarkdownReaderProps) {
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
                <div className="relative group">
                  <pre
                    className={cn(
                      "rounded-lg bg-muted p-4 overflow-x-auto",
                      className,
                    )}
                  >
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                  {/* Copy button could go here */}
                </div>
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
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
