"use client";

import Link from "next/link";
import { CheckCircle2, Circle, FileText, FolderOpen } from "lucide-react";
import { Book } from "@/types";
import { buildChapterTree, ChapterTreeNode } from "@/lib/chapters";
import { useI18n } from "@/lib/i18n";

interface BookChaptersViewProps {
  book: Book;
}

export function BookChaptersView({ book }: BookChaptersViewProps) {
  const { t } = useI18n();
  const chapters = book.chapters ?? [];
  const chapterTree = buildChapterTree(chapters);

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{book.title}</h1>
        <p className="text-muted-foreground text-lg">
          {t("book.chaptersRead", {
            read: book.readChapters ?? 0,
            total: book.totalChapters ?? chapters.length,
          })}
        </p>
      </div>

      <div className="space-y-4">
        {chapterTree.length > 0 ? (
          chapterTree.map((node) => (
            <ChapterTreeItem key={node.id} bookId={book.id} node={node} />
          ))
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            {t("book.noChapters")}
          </div>
        )}
      </div>
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
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-1 text-sm font-semibold text-muted-foreground">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span>{node.title}</span>
        </div>
        <div className="mt-3 space-y-3 border-l pl-4">
          {node.children.map((child) => (
            <ChapterTreeItem key={child.id} bookId={bookId} node={child} />
          ))}
        </div>
      </div>
    );
  }

  const chapter = node.chapter;

  return (
    <Link
      href={`/book/${bookId}/${chapter.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-accent hover:bg-accent/10"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors">
            <FileText className="h-4 w-4" />
          </div>
          <span className="truncate text-lg font-medium">{chapter.title}</span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {chapter.isRead ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          {Math.round(chapter.progress)}%
        </span>
      </div>
    </Link>
  );
}
