import { Injectable } from '@nestjs/common';
import { SearchResult } from '@juejin-flow/shared';
import { PrismaService } from '../prisma/prisma.service';

const MAX_RESULTS = 50;

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: string, bookId?: string): Promise<SearchResult[]> {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }

    const [books, chapters, chunks] = await Promise.all([
      this.prisma.book.findMany({
        where: {
          ...(bookId ? { id: bookId } : {}),
          title: { contains: keyword },
        },
        include: {
          chapters: {
            select: { id: true, isRead: true },
            orderBy: { fileName: 'asc' },
          },
        },
        take: MAX_RESULTS,
      }),
      this.prisma.chapter.findMany({
        where: {
          ...(bookId ? { bookId } : {}),
          title: { contains: keyword },
        },
        select: {
          id: true,
          bookId: true,
          title: true,
          fileName: true,
          book: {
            select: {
              title: true,
            },
          },
        },
        orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
        take: MAX_RESULTS,
      }),
      this.prisma.chapterChunk.findMany({
        where: {
          content: { contains: keyword },
          chapter: {
            ...(bookId ? { bookId } : {}),
          },
        },
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          chapter: {
            select: {
              id: true,
              bookId: true,
              title: true,
              book: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
        orderBy: [{ chapterId: 'asc' }, { chunkIndex: 'asc' }],
        take: MAX_RESULTS,
      }),
    ]);

    const bookResults: SearchResult[] = books.map((book) => ({
      id: book.id,
      type: 'book',
      title: book.title,
      content: `${book.chapters.filter((chapter) => chapter.isRead).length}/${book.chapters.length} chapters read`,
      score: this.scoreText(book.title, keyword) + 20,
      bookId: book.id,
      bookTitle: book.title,
    }));

    const chapterResults: SearchResult[] = chapters.map((chapter) => {
      const titleScore = this.scoreText(chapter.title, keyword);

      return {
        id: chapter.id,
        type: 'chapter',
        title: chapter.title,
        content: chapter.fileName,
        score: titleScore + 10,
        bookId: chapter.bookId,
        chapterId: chapter.id,
        bookTitle: chapter.book.title,
      };
    });

    const contentResults: SearchResult[] = chunks.map((chunk) => ({
      id: chunk.id,
      type: 'content',
      title: chunk.chapter.title,
      content: this.createSnippet(chunk.content, keyword),
      score: this.scoreText(chunk.content, keyword),
      bookId: chunk.chapter.bookId,
      chapterId: chunk.chapter.id,
      bookTitle: chunk.chapter.book.title,
    }));

    return [...bookResults, ...chapterResults, ...contentResults]
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, MAX_RESULTS);
  }

  private scoreText(text: string, keyword: string) {
    const haystack = text.toLowerCase();
    const needle = keyword.toLowerCase();

    if (haystack === needle) {
      return 100;
    }
    if (haystack.startsWith(needle)) {
      return 70;
    }
    if (haystack.includes(needle)) {
      return 35;
    }
    return 0;
  }

  private createSnippet(content: string, keyword: string) {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'No saved content';
    }

    const index = normalized.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) {
      return normalized.slice(0, 160);
    }

    const start = Math.max(0, index - 70);
    const end = Math.min(normalized.length, index + keyword.length + 90);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalized.length ? '...' : '';

    return `${prefix}${normalized.slice(start, end)}${suffix}`;
  }
}
