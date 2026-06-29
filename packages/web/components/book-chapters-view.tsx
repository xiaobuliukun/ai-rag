"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  FolderOpen,
  Layers3,
} from "lucide-react";
import { Book, Chapter } from "@/types";
import { buildChapterTree, ChapterTreeNode } from "@/lib/chapters";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface BookChaptersViewProps {
  book: Book;
}

export function BookChaptersView({ book }: BookChaptersViewProps) {
  const { t } = useI18n();
  const chapters = book.chapters ?? [];
  const chapterTree = buildChapterTree(chapters);
  const totalChapters = book.totalChapters ?? chapters.length;
  const readChapters = book.readChapters ?? 0;
  const progress =
    totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0;
  const firstChapter =
    chapters.find((chapter) => !chapter.isRead) ?? chapters[0] ?? null;

  return (
    <div className="book-detail-view mx-auto flex min-h-full max-w-6xl flex-col gap-5">
      <section className="book-detail-hero rounded-lg border px-5 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              {t("book.localBook")}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {book.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t("book.chaptersRead", {
                read: readChapters,
                total: totalChapters,
              })}
            </p>
          </div>

          <div className="rounded-md border bg-background/72 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t("book.progress")}</span>
              <span className="font-mono text-muted-foreground">{progress}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border bg-card/78 px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {t("book.chapters")}
                </div>
                <div className="mt-1 font-mono font-semibold">
                  {totalChapters}
                </div>
              </div>
              <div className="rounded-md border bg-card/78 px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {t("stats.completedChapters")}
                </div>
                <div className="mt-1 font-mono font-semibold">
                  {readChapters}
                </div>
              </div>
            </div>
            {firstChapter && (
              <Link
                href={`/book/${book.id}/${firstChapter.id}`}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("book.startReading")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="chapter-directory rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <Layers3 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">{t("nav.library")}</h2>
              <p className="text-xs text-muted-foreground">
                {totalChapters} {t("book.chapters")}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {chapterTree.length > 0 ? (
            <div className="space-y-3">
              {chapterTree.map((node) => (
                <ChapterTreeItem key={node.id} bookId={book.id} node={node} />
              ))}
            </div>
          ) : (
            <div className="state-panel flex min-h-48 items-center justify-center rounded-lg border px-6 text-center">
              <div>
                <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("book.noChapters")}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChapterTreeItem({
  bookId,
  node,
}: {
  bookId: string;
  node: ChapterTreeNode;
}) {
  if (!node.chapter) {
    return (
      <div className="chapter-folder space-y-3">
        <div className="flex items-center gap-3 px-1 text-sm font-semibold text-muted-foreground">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="truncate">{node.title}</span>
        </div>
        <div className="space-y-3 border-l pl-4">
          {node.children.map((child) => (
            <ChapterTreeItem key={child.id} bookId={bookId} node={child} />
          ))}
        </div>
      </div>
    );
  }

  return <ChapterLink bookId={bookId} chapter={node.chapter} />;
}

function ChapterLink({ bookId, chapter }: { bookId: string; chapter: Chapter }) {
  const progress = Math.round(chapter.progress);

  return (
    <Link
      href={`/book/${bookId}/${chapter.id}`}
      className={cn(
        "chapter-link block rounded-lg border px-4 py-3 transition-all",
        chapter.isRead && "is-read",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors">
            <FileText className="h-4 w-4" />
          </div>
          <span className="truncate font-medium">{chapter.title}</span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {chapter.isRead ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          {progress}%
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary/80"
          style={{ width: `${progress}%` }}
        />
      </div>
    </Link>
  );
}
