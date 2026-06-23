"use client";

import Link from "next/link";
import { Book as BookIcon, Clock } from "lucide-react";
import { Book } from "@/types";
import { useI18n } from "@/lib/i18n";

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps) {
  const { t } = useI18n();
  const totalChapters = book.totalChapters ?? book.chapters?.length ?? 0;
  const readChapters =
    book.readChapters ??
    book.chapters?.filter((chapter) => chapter.isRead).length ??
    0;
  const progress =
    totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0;

  return (
    <Link href={`/book/${book.id}`} className="block group">
      <div className="bg-card border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
        {/* Cover Image Placeholder */}
        <div className="aspect-[3/4] bg-muted flex items-center justify-center relative group-hover:bg-muted/80 transition-colors">
          {book.coverImage ? (
            <img
              src={book.coverImage}
              alt={book.title}
              className="object-cover w-full h-full"
            />
          ) : (
            <BookIcon className="w-16 h-16 text-muted-foreground opacity-20" />
          )}

          {/* Progress Badge */}
          {progress > 0 && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
              {progress}%
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {book.title}
          </h3>

          <div className="flex items-center text-xs text-muted-foreground gap-2">
            <Clock className="w-3 h-3" />
            <span>
              {book.lastRead
                ? new Date(book.lastRead).toLocaleDateString()
                : t("book.notStarted")}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted-foreground text-right">
            {readChapters}/{totalChapters} {t("book.chapters")}
          </div>
        </div>
      </div>
    </Link>
  );
}
