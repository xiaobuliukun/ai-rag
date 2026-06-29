"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  FileText,
  Loader2,
  Search,
  Sparkles,
  TextSearch,
} from "lucide-react";
import { SearchResult, SearchResultType } from "@/types";
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

const searchTypes: Array<{
  value: SearchResultType;
  labelKey: "search.all" | "search.books" | "search.chapters" | "search.content";
}> = [
  { value: "all", labelKey: "search.all" },
  { value: "book", labelKey: "search.books" },
  { value: "chapter", labelKey: "search.chapters" },
  { value: "content", labelKey: "search.content" },
];

const SEARCH_DEBOUNCE_MS = 450;

export function SearchView({ initialQuery = "" }: SearchViewProps) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = React.useState(initialQuery);
  const [searchQuery, setSearchQuery] = React.useState(initialQuery.trim());
  const [type, setType] = React.useState<SearchResultType>("all");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isComposing, setIsComposing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const displayQuery = inputValue.trim();
  const committedQuery = searchQuery.trim();
  const isQueryPending = Boolean(
    displayQuery && (isComposing || displayQuery !== committedQuery),
  );

  React.useEffect(() => {
    if (isComposing) {
      return;
    }

    const nextQuery = inputValue.trim();

    if (!nextQuery) {
      setSearchQuery("");
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchQuery(nextQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [inputValue, isComposing]);

  React.useEffect(() => {
    const keyword = committedQuery;

    if (!keyword) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await searchLibrary(keyword, undefined, type, {
          signal: controller.signal,
        });
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
    })();

    return () => {
      controller.abort();
    };
  }, [committedQuery, t, type]);

  return (
    <div className="search-view mx-auto flex min-h-full max-w-6xl flex-col gap-5">
      <div className="search-hero rounded-lg border px-5 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(18rem,0.56fr)] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {t("search.scope")}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("search.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t("search.subtitle")}
            </p>
          </div>

          <div className="rounded-md border bg-background/70 p-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              {isQueryPending
                ? t("search.waiting")
                : committedQuery
                ? t("search.resultCount", { count: results.length })
                : t("search.ready")}
            </div>
            <div className="mt-1">
              {displayQuery || t("search.placeholder")}
            </div>
          </div>
        </div>

        <div className="search-box relative mt-5">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              setInputValue(event.currentTarget.value);
            }}
            autoFocus
            placeholder={t("search.placeholder")}
            className="h-14 w-full rounded-md border bg-card pl-12 pr-4 text-base shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="search-segment mt-4 flex w-fit max-w-full flex-wrap gap-1 rounded-md border bg-card p-1 shadow-sm">
          {searchTypes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={cn(
                "h-8 rounded-sm px-3 text-sm font-medium transition-colors",
                type === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="state-panel state-panel-danger flex items-start gap-2 rounded-md border px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3">
        {isLoading ? (
          <div className="state-panel flex min-h-56 items-center justify-center rounded-lg border">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("search.searching")}
            </div>
          </div>
        ) : results.length > 0 ? (
          <div className="grid gap-3">
            {results.map((result) => {
              const Icon = resultIcons[result.type];
              const href = result.chapterId
                ? `/book/${result.bookId}/${result.chapterId}`
                : `/book/${result.bookId}`;
              const hasHighlightedContent =
                result.type === "content" && Boolean(result.highlightedContent);

              return (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={href}
                  className="search-result block rounded-lg border px-4 py-4 transition-all"
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 className="font-semibold text-foreground">
                          {result.title}
                        </h2>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {result.type}
                        </span>
                        {result.bookTitle && result.type !== "book" && (
                          <span className="text-xs text-muted-foreground">
                            {t("search.inBook", { book: result.bookTitle })}
                          </span>
                        )}
                      </div>
                      <p
                        className={cn(
                          "mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground",
                          result.type === "content" && "font-mono text-xs",
                        )}
                      >
                        {hasHighlightedContent ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: result.highlightedContent ?? "",
                            }}
                          />
                        ) : (
                          result.content
                        )}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <div className="font-mono text-foreground">
                        {Math.round(result.score)}
                      </div>
                      <div>{t("search.score")}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : committedQuery ? (
          <div className="state-panel flex min-h-56 items-center justify-center rounded-lg border px-6 text-center">
            <div>
              <TextSearch className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("search.noMatches")}
              </p>
            </div>
          </div>
        ) : displayQuery ? (
          <div className="state-panel flex min-h-56 items-center justify-center rounded-lg border px-6 text-center">
            <div>
              <Search className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("search.waiting")}
              </p>
            </div>
          </div>
        ) : (
          <div className="state-panel flex min-h-56 items-center justify-center rounded-lg border px-6 text-center">
            <div>
              <Search className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("search.noQuery")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
