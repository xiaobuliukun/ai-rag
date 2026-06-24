import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 50;
const SNIPPET_RADIUS = 90;
const MAX_SNIPPET_LENGTH = 220;

export type FtsQueryMode = 'and' | 'or';

export type ContentSearchResult = {
  chunkId: string;
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  content: string;
  excerpt: string;
  highlightedExcerpt: string;
  score: number;
};

type ChunkFtsRow = {
  chunkId: string;
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  rank: number;
};

type CountRow = {
  count: number | bigint;
};

@Injectable()
export class ContentIndexService {
  private indexReadyChecked = false;
  private syncAllPromise?: Promise<void>;

  constructor(private prisma: PrismaService) {}

  async syncBook(bookId: string) {
    await this.prisma.$executeRawUnsafe(
      'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
      bookId,
    );

    const chunks = await this.prisma.chapterChunk.findMany({
      where: {
        chapter: {
          bookId,
        },
      },
      select: {
        id: true,
        content: true,
        chapter: {
          select: {
            id: true,
            title: true,
            bookId: true,
            book: {
              select: {
                title: true,
              },
            },
          },
        },
      },
      orderBy: [{ chapterId: 'asc' }, { chunkIndex: 'asc' }],
    });

    for (const chunk of chunks) {
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO "ChapterChunkFts" ("chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", "searchText") VALUES (?, ?, ?, ?, ?, ?)',
        chunk.id,
        chunk.chapter.bookId,
        chunk.chapter.id,
        chunk.chapter.book.title,
        chunk.chapter.title,
        normalizeSearchText(
          `${chunk.chapter.book.title}\n${chunk.chapter.title}\n${chunk.content}`,
        ),
      );
    }
  }

  async search(
    query: string,
    options?: {
      bookId?: string;
      limit?: number;
      mode?: FtsQueryMode;
    },
  ): Promise<ContentSearchResult[]> {
    const ftsQuery = buildFtsQuery(query, options?.mode ?? 'and');
    if (!ftsQuery) {
      return [];
    }

    await this.ensureIndexReady();

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const rows = options?.bookId
      ? await this.prisma.$queryRawUnsafe<ChunkFtsRow[]>(
          'SELECT "chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", bm25("ChapterChunkFts") AS "rank" FROM "ChapterChunkFts" WHERE "ChapterChunkFts" MATCH ? AND "bookId" = ? ORDER BY "rank" LIMIT ?',
          ftsQuery,
          options.bookId,
          limit,
        )
      : await this.prisma.$queryRawUnsafe<ChunkFtsRow[]>(
          'SELECT "chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", bm25("ChapterChunkFts") AS "rank" FROM "ChapterChunkFts" WHERE "ChapterChunkFts" MATCH ? ORDER BY "rank" LIMIT ?',
          ftsQuery,
          limit,
        );

    if (!rows.length) {
      return [];
    }

    const chunks = await this.prisma.chapterChunk.findMany({
      where: {
        id: {
          in: rows.map((row) => row.chunkId),
        },
      },
      select: {
        id: true,
        content: true,
      },
    });
    const chunkContentById = new Map(
      chunks.map((chunk) => [chunk.id, chunk.content]),
    );

    return rows.flatMap((row) => {
      const content = chunkContentById.get(row.chunkId);
      if (!content) {
        return [];
      }

      const snippet = createHighlightedSnippet(content, query);
      return [
        {
          chunkId: row.chunkId,
          bookId: row.bookId,
          chapterId: row.chapterId,
          bookTitle: row.bookTitle,
          chapterTitle: row.chapterTitle,
          content,
          excerpt: snippet.text,
          highlightedExcerpt: snippet.html,
          score: Math.max(1, Math.round(Math.abs(row.rank) * 1000)),
        },
      ];
    });
  }

  private async ensureIndexReady() {
    if (this.indexReadyChecked) {
      return;
    }

    const rows = await this.prisma.$queryRawUnsafe<CountRow[]>(
      'SELECT count(*) AS "count" FROM "ChapterChunkFts"',
    );
    if (Number(rows[0]?.count ?? 0) > 0) {
      this.indexReadyChecked = true;
      return;
    }

    if (!this.syncAllPromise) {
      this.syncAllPromise = this.syncAllBooks();
    }
    await this.syncAllPromise;
    this.indexReadyChecked = true;
  }

  private async syncAllBooks() {
    const books = await this.prisma.book.findMany({
      select: {
        id: true,
      },
    });

    for (const book of books) {
      await this.syncBook(book.id);
    }
  }
}

export function normalizeSearchText(text: string) {
  return text
    .replace(/[\u4e00-\u9fff]/g, (character) => ` ${character} `)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildFtsQuery(query: string, mode: FtsQueryMode = 'and') {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const latinTerms = normalized.match(/[a-z0-9][a-z0-9_]*/g) ?? [];
  const cjkTerms = normalized.match(/[\u4e00-\u9fff]/g) ?? [];
  const terms = Array.from(new Set([...latinTerms, ...cjkTerms])).slice(0, 24);

  if (!terms.length) {
    return '';
  }

  return terms
    .map((term) =>
      /^[a-z0-9_]+$/.test(term)
        ? `${escapeFtsTerm(term)}*`
        : `"${escapeFtsTerm(term)}"`,
    )
    .join(mode === 'or' ? ' OR ' : ' ');
}

export function createHighlightedSnippet(content: string, query: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { text: '', html: '' };
  }

  const terms = extractHighlightTerms(query);
  const lowerContent = normalized.toLowerCase();
  const firstMatch = terms
    .map((term) => lowerContent.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  const start =
    firstMatch === undefined ? 0 : Math.max(0, firstMatch - SNIPPET_RADIUS);
  const end =
    firstMatch === undefined
      ? Math.min(normalized.length, MAX_SNIPPET_LENGTH)
      : Math.min(normalized.length, firstMatch + MAX_SNIPPET_LENGTH);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalized.length ? '...' : '';
  const text = `${prefix}${normalized.slice(start, end)}${suffix}`;

  return {
    text,
    html: highlightHtml(text, terms),
  };
}

function extractHighlightTerms(query: string) {
  const latinTerms = query.match(/[a-z0-9][a-z0-9_-]*/gi) ?? [];
  const cjkTerms = query.match(/[\u4e00-\u9fff]+/g) ?? [];

  return Array.from(new Set([...latinTerms, ...cjkTerms]))
    .filter((term) => term.trim().length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
}

function highlightHtml(text: string, terms: string[]) {
  if (!terms.length) {
    return escapeHtml(text);
  }

  const pattern = new RegExp(
    `(${terms.map((term) => escapeRegExp(term)).join('|')})`,
    'gi',
  );

  return text
    .split(pattern)
    .map((part) =>
      terms.some((term) => term.toLowerCase() === part.toLowerCase())
        ? `<mark>${escapeHtml(part)}</mark>`
        : escapeHtml(part),
    )
    .join('');
}

function escapeFtsTerm(term: string) {
  return term.replace(/"/g, '""');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
