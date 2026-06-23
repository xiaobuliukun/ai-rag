"use client";

import Link from "next/link";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { Book } from "@/types";
import { useI18n } from "@/lib/i18n";

interface BookChaptersViewProps {
  book: Book;
}

export function BookChaptersView({ book }: BookChaptersViewProps) {
  const { t } = useI18n();
  const chapters = book.chapters ?? [];

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
        {chapters.length > 0 ? (
          chapters.map((chapter) => (
            <Link
              key={chapter.id}
              href={`/book/${book.id}/${chapter.id}`}
              className="block p-4 border rounded-lg hover:bg-accent/10 hover:border-accent transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-accent group-hover:bg-accent/20 transition-colors">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-lg">{chapter.title}</span>
                </div>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {chapter.isRead ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                  {Math.round(chapter.progress)}%
                </span>
              </div>
            </Link>
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
