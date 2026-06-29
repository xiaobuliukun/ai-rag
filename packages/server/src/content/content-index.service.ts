import { Injectable } from '@nestjs/common';
import type { SearchIndexStatus } from '@moxu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret } from '../ai/secrets';
import {
  buildLocalEmbedding,
  cosineSimilarity,
  parseEmbedding,
  serializeEmbedding,
} from './semantic';

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

export type SemanticSearchResult = Omit<
  ContentSearchResult,
  'excerpt' | 'highlightedExcerpt'
>;

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

type EmbeddingProvider = 'local' | 'openai-compatible';

type EmbeddingConfig = {
  provider: EmbeddingProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

type EmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
};

@Injectable()
export class ContentIndexService {
  private indexReadyChecked = false;
  private syncAllPromise?: Promise<void>;

  constructor(private prisma: PrismaService) {}

  async getStatus(): Promise<SearchIndexStatus> {
    const [
      totalBooks,
      totalChapters,
      totalChunks,
      ftsRows,
      vectorChunks,
      vectorSample,
    ] = await Promise.all([
      this.prisma.book.count(),
      this.prisma.chapter.count(),
      this.prisma.chapterChunk.count(),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        'SELECT count(*) AS "count" FROM "ChapterChunkFts"',
      ),
      this.prisma.vectorData.count(),
      this.prisma.vectorData.findFirst({
        select: {
          metadata: true,
        },
      }),
    ]);
    const ftsChunks = toCount(ftsRows[0]?.count);
    const metadata = parseVectorMetadata(vectorSample?.metadata);

    return {
      totalBooks,
      totalChapters,
      totalChunks,
      ftsChunks,
      vectorChunks,
      isFtsReady: totalChunks > 0 && ftsChunks >= totalChunks,
      isVectorReady: totalChunks > 0 && vectorChunks >= totalChunks,
      embeddingProvider: metadata.embeddingProvider,
      embeddingModel: metadata.embeddingModel,
    };
  }

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

    await this.syncVectorData(bookId, chunks);
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
    const rows = await this.searchFtsRows(ftsQuery, options?.bookId, limit * 2);
    const relaxedQuery = buildFtsQuery(query, 'or');
    const relaxedRows =
      options?.mode !== 'or' &&
      relaxedQuery &&
      relaxedQuery !== ftsQuery &&
      rows.length < Math.min(8, limit)
        ? await this.searchFtsRows(relaxedQuery, options?.bookId, limit)
        : [];
    const mergedRows = mergeFtsRows(rows, relaxedRows).slice(0, limit);

    if (!mergedRows.length) {
      return [];
    }

    const chunks = await this.prisma.chapterChunk.findMany({
      where: {
        id: {
          in: mergedRows.map((row) => row.chunkId),
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

    return mergedRows.flatMap((row) => {
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
          score: Math.max(
            1,
            Math.round(
              Math.abs(row.rank) * 1000 +
                scoreContentMatch(
                  `${row.bookTitle}\n${row.chapterTitle}\n${content}`,
                  query,
                ),
            ),
          ),
        },
      ];
    });
  }

  private searchFtsRows(
    ftsQuery: string,
    bookId: string | undefined,
    limit: number,
  ) {
    return bookId
      ? this.prisma.$queryRawUnsafe<ChunkFtsRow[]>(
          'SELECT "chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", bm25("ChapterChunkFts") AS "rank" FROM "ChapterChunkFts" WHERE "ChapterChunkFts" MATCH ? AND "bookId" = ? ORDER BY "rank" LIMIT ?',
          ftsQuery,
          bookId,
          limit,
        )
      : this.prisma.$queryRawUnsafe<ChunkFtsRow[]>(
          'SELECT "chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", bm25("ChapterChunkFts") AS "rank" FROM "ChapterChunkFts" WHERE "ChapterChunkFts" MATCH ? ORDER BY "rank" LIMIT ?',
          ftsQuery,
          limit,
        );
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

    await this.runSyncAllBooks();
    this.indexReadyChecked = true;
  }

  private async runSyncAllBooks() {
    if (!this.syncAllPromise) {
      this.syncAllPromise = this.syncAllBooks().finally(() => {
        this.syncAllPromise = undefined;
      });
    }

    await this.syncAllPromise;
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

  private async syncVectorData(
    bookId: string,
    chunks: Array<{
      id: string;
      content: string;
      chapter: {
        id: string;
        title: string;
        bookId: string;
        book: {
          title: string;
        };
      };
    }>,
  ) {
    await this.prisma.vectorData.deleteMany({
      where: {
        chapter: {
          bookId,
        },
      },
    });

    if (!chunks.length) {
      return;
    }

    const embeddingConfig = await this.resolveEmbeddingConfig();
    const embeddingTexts = chunks.map(
      (chunk) =>
        `${chunk.chapter.book.title}\n${chunk.chapter.title}\n${chunk.content}`,
    );
    const embeddingResult = await this.buildEmbeddings(
      embeddingTexts,
      embeddingConfig,
    );

    await this.prisma.vectorData.createMany({
      data: chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        chapterId: chunk.chapter.id,
        content: chunk.content,
        embedding: serializeEmbedding(
          embeddingResult.vectors[index] ??
            buildLocalEmbedding(embeddingTexts[index] ?? ''),
        ),
        metadata: JSON.stringify({
          bookId: chunk.chapter.bookId,
          chapterTitle: chunk.chapter.title,
          embeddingProvider: embeddingResult.config.provider,
          embeddingModel: embeddingResult.config.model,
        }),
      })),
    });
  }

  async semanticSearch(
    query: string,
    options?: {
      bookId?: string;
      limit?: number;
    },
  ): Promise<SemanticSearchResult[]> {
    const embeddingConfig = await this.resolveEmbeddingConfig();
    const queryEmbedding = await this.buildEmbedding(query, embeddingConfig);
    if (!query.trim() || queryEmbedding.every((value) => value === 0)) {
      return [];
    }

    await this.ensureIndexReady();
    await this.ensureVectorIndexReady(embeddingConfig);

    const rows = await this.prisma.vectorData.findMany({
      where: {
        ...(options?.bookId
          ? {
              chapter: {
                bookId: options.bookId,
              },
            }
          : {}),
      },
      select: {
        chunkId: true,
        chapterId: true,
        content: true,
        embedding: true,
        chapter: {
          select: {
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
    });

    return rows
      .map((row) => ({
        chunkId: row.chunkId,
        bookId: row.chapter.bookId,
        chapterId: row.chapterId,
        bookTitle: row.chapter.book.title,
        chapterTitle: row.chapter.title,
        content: row.content,
        score: Math.round(
          Math.max(
            0,
            cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding)),
          ) * 100,
        ),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit ?? DEFAULT_LIMIT);
  }

  private async ensureVectorIndexReady(embeddingConfig: EmbeddingConfig) {
    const count = await this.prisma.vectorData.count();
    if (count > 0 && (await this.isVectorIndexCurrent(embeddingConfig))) {
      return;
    }

    await this.runSyncAllBooks();
  }

  private async isVectorIndexCurrent(embeddingConfig: EmbeddingConfig) {
    const existing = await this.prisma.vectorData.findFirst({
      select: {
        metadata: true,
      },
    });
    const metadata = parseVectorMetadata(existing?.metadata);

    return (
      metadata.embeddingProvider === embeddingConfig.provider &&
      metadata.embeddingModel === embeddingConfig.model
    );
  }

  private async resolveEmbeddingConfig(): Promise<EmbeddingConfig> {
    const saved = await this.prisma.aiConfig
      .findUnique({
        where: { id: 'default' },
      })
      .catch(() => null);
    const provider =
      saved?.embeddingProvider === 'openai-compatible' ||
      process.env.AI_EMBEDDING_PROVIDER === 'openai-compatible'
        ? 'openai-compatible'
        : 'local';
    const baseUrl =
      process.env.AI_EMBEDDING_BASE_URL ||
      saved?.baseUrl ||
      process.env.AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
    const apiKey =
      process.env.AI_EMBEDDING_API_KEY ||
      decryptSecret(saved?.apiKey) ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';
    const model =
      process.env.AI_EMBEDDING_MODEL ||
      saved?.embeddingModel ||
      (provider === 'openai-compatible'
        ? 'text-embedding-3-small'
        : 'local-hash-v1');

    if (provider !== 'openai-compatible' || !apiKey) {
      return {
        provider: 'local',
        model: 'local-hash-v1',
      };
    }

    return {
      provider,
      model,
      baseUrl,
      apiKey,
    };
  }

  private async buildEmbeddings(texts: string[], config: EmbeddingConfig) {
    if (config.provider === 'local') {
      return {
        vectors: texts.map((text) => buildLocalEmbedding(text)),
        config,
      };
    }

    try {
      const response = await fetch(
        `${config.baseUrl?.replace(/\/$/, '')}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: texts,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Embedding request failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as EmbeddingResponse;
      return {
        vectors: texts.map((text, index) =>
          this.normalizeRemoteEmbedding(
            payload.data?.find((item) => item.index === index)?.embedding,
            text,
          ),
        ),
        config,
      };
    } catch {
      return {
        vectors: texts.map((text) => buildLocalEmbedding(text)),
        config: {
          provider: 'local',
          model: 'local-hash-v1',
        } satisfies EmbeddingConfig,
      };
    }
  }

  private async buildEmbedding(text: string, config: EmbeddingConfig) {
    if (config.provider === 'local') {
      return buildLocalEmbedding(text);
    }

    try {
      const response = await fetch(
        `${config.baseUrl?.replace(/\/$/, '')}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: text,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Embedding request failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as EmbeddingResponse;
      return this.normalizeRemoteEmbedding(payload.data?.[0]?.embedding, text);
    } catch {
      return buildLocalEmbedding(text);
    }
  }

  private normalizeRemoteEmbedding(value: unknown, fallbackText: string) {
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'number')
      ? value
      : buildLocalEmbedding(fallbackText);
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

export function parseVectorMetadata(value?: string | null): {
  embeddingProvider?: EmbeddingProvider;
  embeddingModel?: string;
} {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? {
          embeddingProvider:
            (parsed as Record<string, unknown>).embeddingProvider ===
            'openai-compatible'
              ? 'openai-compatible'
              : (parsed as Record<string, unknown>).embeddingProvider ===
                  'local'
                ? 'local'
                : undefined,
          embeddingModel:
            typeof (parsed as Record<string, unknown>).embeddingModel ===
            'string'
              ? ((parsed as Record<string, unknown>).embeddingModel as string)
              : undefined,
        }
      : {};
  } catch {
    return {};
  }
}

function toCount(value: number | bigint | undefined) {
  return Number(value ?? 0);
}

function extractHighlightTerms(query: string) {
  const latinTerms = query.match(/[a-z0-9][a-z0-9_-]*/gi) ?? [];
  const cjkPhrases = Array.from(
    query.matchAll(/[\u4e00-\u9fff]+/g),
    (match) => match[0],
  );
  const cjkBigrams = cjkPhrases.flatMap((phrase) => {
    const grams: string[] = [];
    for (let index = 0; index < phrase.length - 1; index += 1) {
      grams.push(phrase.slice(index, index + 2));
    }
    return grams;
  });
  const cjkChars = Array.from(
    query.matchAll(/[\u4e00-\u9fff]/g),
    (match) => match[0],
  );

  return Array.from(
    new Set([...latinTerms, ...cjkPhrases, ...cjkBigrams, ...cjkChars]),
  )
    .filter((term) => term.trim().length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, 18);
}

function mergeFtsRows(primaryRows: ChunkFtsRow[], relaxedRows: ChunkFtsRow[]) {
  const rowsById = new Map<string, ChunkFtsRow>();

  for (const row of primaryRows) {
    rowsById.set(row.chunkId, row);
  }

  for (const row of relaxedRows) {
    const existing = rowsById.get(row.chunkId);
    rowsById.set(row.chunkId, {
      ...row,
      rank: existing ? Math.min(existing.rank, row.rank) : row.rank * 0.68,
    });
  }

  return Array.from(rowsById.values()).sort(
    (left, right) => Math.abs(right.rank) - Math.abs(left.rank),
  );
}

function scoreContentMatch(text: string, query: string) {
  const normalizedText = text.toLowerCase().replace(/\s+/g, '');
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');
  if (!normalizedText || !normalizedQuery) {
    return 0;
  }

  let score = normalizedText.includes(normalizedQuery) ? 120 : 0;
  const terms = extractHighlightTerms(query);
  const matched = terms.filter((term) =>
    normalizedText.includes(term.toLowerCase()),
  );

  score += matched.reduce(
    (total, term) => total + (term.length > 1 ? 18 : 4),
    0,
  );

  return score;
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
