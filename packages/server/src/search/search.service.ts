import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultType } from '@juejin-flow/shared';
import {
  ContentIndexService,
  ContentSearchResult,
} from '../content/content-index.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_RESULTS = 50;
const SEARCH_TYPES: SearchResultType[] = ['all', 'book', 'chapter', 'content'];

type BookSearchRecord = {
  id: string;
  title: string;
  chapters: Array<{
    id: string;
    isRead: boolean;
  }>;
};

type ChapterSearchRecord = {
  id: string;
  bookId: string;
  title: string;
  fileName: string;
  book: {
    title: string;
  };
};

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  async search(
    query: string,
    bookId?: string,
    type: SearchResultType = 'all',
  ): Promise<SearchResult[]> {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }

    const resultType = SEARCH_TYPES.includes(type) ? type : 'all';

    const bookSearch = this.searchBooks(keyword, bookId, resultType);
    const chapterSearch = this.searchChapters(keyword, bookId, resultType);
    const contentSearch = this.searchContent(keyword, bookId, resultType);
    const [books, chapters, chunks] = await Promise.all([
      bookSearch,
      chapterSearch,
      contentSearch,
    ]);

    const bookResults: SearchResult[] = books.map((book) => ({
      id: book.id,
      type: 'book' as const,
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
        type: 'chapter' as const,
        title: chapter.title,
        content: chapter.fileName,
        score: titleScore + 10,
        bookId: chapter.bookId,
        chapterId: chapter.id,
        bookTitle: chapter.book.title,
      };
    });

    const contentResults: SearchResult[] = chunks.map((chunk) => ({
      id: chunk.chunkId,
      type: 'content' as const,
      title: chunk.chapterTitle,
      content: chunk.excerpt,
      highlightedContent: chunk.highlightedExcerpt,
      score: chunk.score,
      bookId: chunk.bookId,
      chapterId: chunk.chapterId,
      bookTitle: chunk.bookTitle,
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

  private searchBooks(
    keyword: string,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<BookSearchRecord[]> {
    if (resultType !== 'all' && resultType !== 'book') {
      return Promise.resolve([]);
    }

    return this.prisma.book.findMany({
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
    });
  }

  private searchChapters(
    keyword: string,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<ChapterSearchRecord[]> {
    if (resultType !== 'all' && resultType !== 'chapter') {
      return Promise.resolve([]);
    }

    return this.prisma.chapter.findMany({
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
    });
  }

  private searchContent(
    keyword: string,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<ContentSearchResult[]> {
    if (resultType !== 'all' && resultType !== 'content') {
      return Promise.resolve([]);
    }

    return this.contentIndex.search(keyword, {
      bookId,
      limit: MAX_RESULTS,
    });
  }
}
