"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { BookOpen, Clock } from "lucide-react";
import { Book } from "@/types";
import { getBookAssetUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ApiImage } from "@/components/api-image";

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
  const coverImage = resolveCoverImage(book);
  const coverPalette = getBookPalette(book.title);
  const coverStyle = {
    "--book-cover-a": coverPalette.start,
    "--book-cover-b": coverPalette.end,
    "--book-accent": coverPalette.accent,
  } as CSSProperties;
  const bookSerial = getBookSerial(book.title);

  return (
    <Link href={`/book/${book.id}`} className="group block h-full min-w-0">
      <article
        className="book-tile flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-all duration-300 group-hover:-translate-y-0.5"
        style={coverStyle}
      >
        <div className="book-tile-cover relative shrink-0 overflow-hidden">
          {coverImage && (
            <ApiImage
              src={coverImage}
              alt={book.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 20vw, 220px"
              className="object-cover"
              unoptimized
            />
          )}
          <div className="book-tile-cover-shade" aria-hidden="true" />
          <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
            <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase text-white/70">
              <span className="book-tile-label">Moxu Archive</span>
              <BookOpen className="h-4 w-4" />
            </div>
            <h3 className="line-clamp-3 text-lg font-semibold leading-tight text-white drop-shadow-sm">
              {book.title}
            </h3>
          </div>
          {progress > 0 && (
            <span className="absolute right-3 top-3 z-20 rounded-sm bg-foreground/82 px-2 py-1 text-[11px] font-semibold text-background shadow-sm">
              {progress}%
            </span>
          )}
        </div>

        <div className="book-tile-body flex min-w-0 flex-1 flex-col p-3.5">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase text-muted-foreground">
            <span>Collected note</span>
            <span>{bookSerial}</span>
          </div>

          <div className="mt-auto space-y-2.5 pt-4">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {book.lastRead
                    ? new Date(book.lastRead).toLocaleDateString()
                    : t("book.notStarted")}
                </span>
              </span>
              <span className="shrink-0 font-medium text-foreground">{progress}%</span>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[hsl(var(--book-accent))] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">
                {readChapters}/{totalChapters}
              </span>
              <span>{t("book.chapters")}</span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

function resolveCoverImage(book: Book) {
  if (!book.coverImage) {
    return "";
  }

  if (/^(https?:|data:|blob:|\/)/i.test(book.coverImage)) {
    return book.coverImage;
  }

  return getBookAssetUrl(book.id, book.coverImage);
}

function getBookPalette(title: string) {
  const palettes = [
    { start: "218 22% 22%", end: "216 20% 11%", accent: "27 48% 56%" },
    { start: "348 30% 30%", end: "12 28% 16%", accent: "33 44% 58%" },
    { start: "206 26% 28%", end: "222 22% 15%", accent: "18 58% 47%" },
    { start: "148 18% 27%", end: "132 18% 15%", accent: "31 42% 55%" },
    { start: "188 20% 28%", end: "203 24% 14%", accent: "26 48% 53%" },
    { start: "286 18% 28%", end: "232 19% 15%", accent: "38 38% 60%" },
  ];
  let hash = 0;

  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) % palettes.length;
  }

  return palettes[hash];
}

function getBookSerial(title: string) {
  let hash = 11;

  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 29 + title.charCodeAt(index)) % 1000;
  }

  return `No.${String(hash).padStart(3, "0")}`;
}
