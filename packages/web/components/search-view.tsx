"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  FileText,
  Loader2,
  Search,
  TextSearch,
} from "lucide-react";
import { SearchResult } from "@/types";
import { searchLibrary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface SearchViewProps {
  initialQuery?: string;
}

const resultIcons = {
  book: BookOpen,
  chapter: FileText,
  content: TextSearch,
};

export function SearchView({ initialQuery = "" }: SearchViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const keyword = query.trim();

    if (!keyword) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await searchLibrary(keyword);
        if (!controller.signal.aborted) {
          setResults(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(err instanceof Error ? err.message : t("search.failed"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, t]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("search.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("search.subtitle")}</p>
        </div>

        <div className="relative max-w-3xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder={t("search.placeholder")}
            className="h-12 w-full rounded-md border bg-card pl-12 pr-4 text-base shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border bg-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : results.length > 0 ? (
          results.map((result) => {
            const Icon = resultIcons[result.type];
            const href = result.chapterId
              ? `/book/${result.bookId}/${result.chapterId}`
              : `/book/${result.bookId}`;

            return (
              <Link
                key={`${result.type}-${result.id}`}
                href={href}
                className="block rounded-lg border bg-card px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-md"
              >
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="font-semibold text-foreground">
                        {result.title}
                      </h2>
                      {result.bookTitle && result.type !== "book" && (
                        <span className="text-xs text-muted-foreground">
                          {t("search.inBook", { book: result.bookTitle })}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground",
                        result.type === "content" && "font-mono text-xs",
                      )}
                    >
                      {result.content}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        ) : query.trim() ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border bg-card px-6 text-center text-muted-foreground">
            {t("search.noMatches")}
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border bg-card px-6 text-center text-muted-foreground">
            {t("search.noQuery")}
          </div>
        )}
      </div>
    </div>
  );
}
