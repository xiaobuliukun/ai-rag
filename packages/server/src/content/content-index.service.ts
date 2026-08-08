import { Injectable } from '@nestjs/common';
import type { SearchIndexStatus } from '@moxu/shared';
import type { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret } from '../ai/secrets';
import {
  buildRemoteRequestUrl,
  createRemoteRequestSignal,
  DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
  normalizeRemoteBaseUrl,
} from '../ai/remote-request';
import {
  buildLocalEmbedding,
  cosineSimilarity,
  LOCAL_EMBEDDING_DIMENSIONS,
  parseEmbedding,
  serializeEmbedding,
} from './semantic';

const DEFAULT_LIMIT = 50;
const SNIPPET_RADIUS = 90;
const MAX_SNIPPET_LENGTH = 220;
const REMOTE_EMBEDDING_BATCH_SIZE = 48;
const MAX_REMOTE_EMBEDDING_TEXT_CHARS = 8000;
const VECTOR_SEARCH_BATCH_SIZE = 500;

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

type VectorMetadataRow = {
  metadata: string | null;
};

type FtsIndexStateRow = {
  totalChunks: number | bigint;
  ftsChunks: number | bigint;
  missingChunks: number | bigint;
  staleRows: number | bigint;
  mismatchedRows: number | bigint;
};

type FtsIndexState = {
  totalChunks: number;
  ftsChunks: number;
  missingChunks: number;
  staleRows: number;
  mismatchedRows: number;
};

type EmbeddingProvider = 'local' | 'openai-compatible';

type EmbeddingConfig = {
  provider: EmbeddingProvider;
  model: string;
  endpointFingerprint: string;
  baseUrl?: string;
  apiKey?: string;
};

type IndexableChunk = {
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
};

type PreparedFtsRow = {
  chunkId: string;
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  searchText: string;
};

type PreparedVectorRow = {
  chunkId: string;
  chapterId: string;
  content: string;
  embedding: string;
  metadata: string;
};

type PreparedBookContent = {
  bookId: string;
  chunks: IndexableChunk[];
  ftsRows: PreparedFtsRow[];
};

type PreparedBookIndex = Omit<PreparedBookContent, 'chunks'> & {
  vectorRows: PreparedVectorRow[];
  embeddingDimensions?: number;
};

type IndexOperationOptions = {
  signal?: AbortSignal;
};

type EmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
};

class RemoteEmbeddingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RemoteEmbeddingError';
  }
}

@Injectable()
export class ContentIndexService {
  private indexReadyChecked = false;
  private indexGeneration = 0;
  private indexOperationTail: Promise<void> = Promise.resolve();
  private indexReadyPromise?: Promise<void>;
  private rebuildPromise?: Promise<void>;
  private vectorReadyCheck?: {
    key: string;
    generation: number;
    promise: Promise<void>;
  };

  constructor(private prisma: PrismaService) {}

  async getStatus(): Promise<SearchIndexStatus> {
    const [totalBooks, totalChapters, ftsState, vectorChunks, embeddingConfig] =
      await Promise.all([
        this.prisma.book.count(),
        this.prisma.chapter.count(),
        this.getFtsIndexState(),
        this.prisma.vectorData.count(),
        this.resolveEmbeddingConfig(),
      ]);
    const metadata = await this.findCurrentVectorMetadata(embeddingConfig);
    const expectedDimensions =
      embeddingConfig.provider === 'local'
        ? LOCAL_EMBEDDING_DIMENSIONS
        : metadata.embeddingDimensions;
    const currentVectorChunks = expectedDimensions
      ? await this.countCurrentVectorRows(embeddingConfig, expectedDimensions)
      : 0;

    return {
      totalBooks,
      totalChapters,
      totalChunks: ftsState.totalChunks,
      ftsChunks: ftsState.ftsChunks,
      vectorChunks,
      isFtsReady:
        ftsState.totalChunks > 0 && this.isFtsIndexConsistent(ftsState),
      isVectorReady:
        ftsState.totalChunks > 0 &&
        vectorChunks === ftsState.totalChunks &&
        currentVectorChunks === ftsState.totalChunks,
      embeddingProvider: embeddingConfig.provider,
      embeddingModel: embeddingConfig.model,
    };
  }

  async syncBook(bookId: string, options: IndexOperationOptions = {}) {
    const wasReady = this.indexReadyChecked;
    const generation = this.markIndexDirty();

    try {
      await this.enqueueIndexOperation(() =>
        this.syncBookUnsafe(bookId, options.signal),
      );
      if (wasReady && generation === this.indexGeneration) {
        this.indexReadyChecked = true;
      }
    } catch (error) {
      this.indexReadyChecked = false;
      throw error;
    }
  }

  async removeBook(bookId: string) {
    const wasReady = this.indexReadyChecked;
    const generation = this.markIndexDirty();

    try {
      await this.enqueueIndexOperation(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
            bookId,
          );
          await tx.vectorData.deleteMany({
            where: {
              chapter: {
                bookId,
              },
            },
          });
        }),
      );
      if (wasReady && generation === this.indexGeneration) {
        this.indexReadyChecked = true;
      }
    } catch (error) {
      this.indexReadyChecked = false;
      throw error;
    }
  }

  async rebuildIndex(options: IndexOperationOptions = {}) {
    if (!this.rebuildPromise) {
      const generation = this.markIndexDirty();
      const rebuild = this.enqueueIndexOperation(async () => {
        await this.rebuildIndexUnsafe(undefined, undefined, options.signal);
        if (generation === this.indexGeneration) {
          this.indexReadyChecked = true;
        }
      });
      this.rebuildPromise = rebuild.finally(() => {
        this.rebuildPromise = undefined;
      });
    }

    await this.rebuildPromise;
  }

  private async syncBookUnsafe(bookId: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    const embeddingConfig = await this.resolveEmbeddingConfig();
    const existingMetadata =
      embeddingConfig.provider === 'local'
        ? undefined
        : await this.findCurrentVectorMetadata(embeddingConfig);
    const preparedContent = await this.prepareBookContent(bookId);

    try {
      const prepared = await this.prepareBookIndex(
        preparedContent,
        embeddingConfig,
        embeddingConfig.provider === 'local'
          ? LOCAL_EMBEDDING_DIMENSIONS
          : existingMetadata?.embeddingDimensions,
        signal,
      );
      throwIfAborted(signal);

      await this.prisma.$transaction((tx) =>
        this.writePreparedBookIndex(tx, prepared, true),
      );
    } catch (error) {
      if (!(error instanceof RemoteEmbeddingError) && !signal?.aborted) {
        throw error;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.replacePreparedBookFts(tx, preparedContent, true);
      });
      throw error;
    }
  }

  private async prepareBookContent(
    bookId: string,
  ): Promise<PreparedBookContent> {
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

    return {
      bookId,
      chunks,
      ftsRows: chunks.map((chunk) => ({
        chunkId: chunk.id,
        bookId: chunk.chapter.bookId,
        chapterId: chunk.chapter.id,
        bookTitle: chunk.chapter.book.title,
        chapterTitle: chunk.chapter.title,
        searchText: normalizeSearchText(
          `${chunk.chapter.book.title}\n${chunk.chapter.title}\n${chunk.content}`,
        ),
      })),
    };
  }

  private async prepareBookIndex(
    preparedContent: PreparedBookContent,
    embeddingConfig: EmbeddingConfig,
    expectedDimensions?: number,
    signal?: AbortSignal,
  ): Promise<PreparedBookIndex> {
    const { rows: vectorRows, dimensions: embeddingDimensions } =
      await this.buildVectorRows(
        preparedContent.chunks,
        embeddingConfig,
        expectedDimensions,
        signal,
      );

    return {
      bookId: preparedContent.bookId,
      ftsRows: preparedContent.ftsRows,
      vectorRows,
      embeddingDimensions,
    };
  }

  private async writePreparedBookIndex(
    tx: Prisma.TransactionClient,
    prepared: PreparedBookIndex,
    replaceExisting: boolean,
  ) {
    if (replaceExisting) {
      await this.replacePreparedBookFts(tx, prepared, true);
      await tx.vectorData.deleteMany({
        where: {
          chapter: {
            bookId: prepared.bookId,
          },
        },
      });
    } else {
      await this.replacePreparedBookFts(tx, prepared, false);
    }

    if (prepared.vectorRows.length) {
      await tx.vectorData.createMany({
        data: prepared.vectorRows,
      });
    }
  }

  private async replacePreparedBookFts(
    tx: Prisma.TransactionClient,
    prepared: Pick<PreparedBookContent, 'bookId' | 'ftsRows'>,
    replaceExisting: boolean,
  ) {
    if (replaceExisting) {
      await tx.$executeRawUnsafe(
        'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
        prepared.bookId,
      );
    }

    for (const row of prepared.ftsRows) {
      await tx.$executeRawUnsafe(
        'INSERT INTO "ChapterChunkFts" ("chunkId", "bookId", "chapterId", "bookTitle", "chapterTitle", "searchText") VALUES (?, ?, ?, ?, ?, ?)',
        row.chunkId,
        row.bookId,
        row.chapterId,
        row.bookTitle,
        row.chapterTitle,
        row.searchText,
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

    if (!this.indexReadyPromise) {
      const generation = this.indexGeneration;
      const readinessCheck = this.enqueueIndexOperation(async () => {
        const state = await this.getFtsIndexState();
        if (!this.isFtsIndexConsistent(state)) {
          await this.rebuildFtsIndexUnsafe();
        }
        if (generation === this.indexGeneration) {
          this.indexReadyChecked = true;
        }
      });
      this.indexReadyPromise = readinessCheck.finally(() => {
        this.indexReadyPromise = undefined;
      });
    }

    await this.indexReadyPromise;
    if (!this.indexReadyChecked) {
      await this.ensureIndexReady();
    }
  }

  private async rebuildIndexUnsafe(
    expectedConfig?: EmbeddingConfig,
    expectedDimensions?: number,
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const embeddingConfig =
      expectedConfig ?? (await this.resolveEmbeddingConfig());
    const books = await this.prisma.book.findMany({
      select: {
        id: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
    const preparedContents: PreparedBookContent[] = [];

    for (const book of books) {
      throwIfAborted(signal);
      preparedContents.push(await this.prepareBookContent(book.id));
    }

    const preparedBooks: PreparedBookIndex[] = [];
    let sharedDimensions =
      embeddingConfig.provider === 'local'
        ? LOCAL_EMBEDDING_DIMENSIONS
        : expectedDimensions;

    try {
      for (const preparedContent of preparedContents) {
        throwIfAborted(signal);
        const prepared = await this.prepareBookIndex(
          preparedContent,
          embeddingConfig,
          sharedDimensions,
          signal,
        );
        sharedDimensions ??= prepared.embeddingDimensions;
        preparedBooks.push(prepared);
      }
      throwIfAborted(signal);
    } catch (error) {
      if (!(error instanceof RemoteEmbeddingError) && !signal?.aborted) {
        throw error;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('DELETE FROM "ChapterChunkFts"');

        for (const preparedContent of preparedContents) {
          await this.replacePreparedBookFts(tx, preparedContent, false);
        }
      });
      throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM "ChapterChunkFts"');
      await tx.vectorData.deleteMany();

      for (const prepared of preparedBooks) {
        await this.writePreparedBookIndex(tx, prepared, false);
      }
    });
  }

  private async rebuildFtsIndexUnsafe() {
    const books = await this.prisma.book.findMany({
      select: {
        id: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
    const preparedContents: PreparedBookContent[] = [];

    for (const book of books) {
      preparedContents.push(await this.prepareBookContent(book.id));
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM "ChapterChunkFts"');
      for (const preparedContent of preparedContents) {
        await this.replacePreparedBookFts(tx, preparedContent, false);
      }
    });
  }

  private async buildVectorRows(
    chunks: IndexableChunk[],
    embeddingConfig: EmbeddingConfig,
    expectedDimensions?: number,
    signal?: AbortSignal,
  ) {
    if (!chunks.length) {
      return {
        rows: [] as PreparedVectorRow[],
        dimensions: expectedDimensions,
      };
    }

    const embeddingTexts = chunks.map(
      (chunk) =>
        `${chunk.chapter.book.title}\n${chunk.chapter.title}\n${chunk.content}`,
    );
    const embeddingResult = await this.buildEmbeddings(
      embeddingTexts,
      embeddingConfig,
      signal,
    );
    const dimensions = embeddingResult.vectors[0]?.length;
    if (
      !dimensions ||
      embeddingResult.vectors.length !== chunks.length ||
      embeddingResult.vectors.some((vector) => vector.length !== dimensions)
    ) {
      throw new RemoteEmbeddingError(
        'Embedding response did not match the indexed content',
      );
    }
    if (expectedDimensions && dimensions !== expectedDimensions) {
      throw new RemoteEmbeddingError(
        `Embedding dimensions changed from ${expectedDimensions} to ${dimensions}`,
      );
    }

    return {
      rows: chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        chapterId: chunk.chapter.id,
        content: chunk.content,
        embedding: serializeEmbedding(embeddingResult.vectors[index]),
        metadata: JSON.stringify({
          bookId: chunk.chapter.bookId,
          bookTitle: chunk.chapter.book.title,
          chapterTitle: chunk.chapter.title,
          embeddingProvider: embeddingResult.config.provider,
          embeddingModel: embeddingResult.config.model,
          embeddingEndpoint: embeddingResult.config.endpointFingerprint,
          embeddingDimensions: dimensions,
        }),
      })),
      dimensions,
    };
  }

  async semanticSearch(
    query: string,
    options?: {
      bookId?: string;
      limit?: number;
    },
  ): Promise<SemanticSearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const embeddingConfig = await this.resolveEmbeddingConfig();
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.buildEmbedding(query, embeddingConfig);
    } catch (error) {
      if (error instanceof RemoteEmbeddingError) {
        return [];
      }
      throw error;
    }

    if (queryEmbedding.every((value) => value === 0)) {
      return [];
    }

    await this.ensureIndexReady();
    try {
      await this.ensureVectorIndexReady(embeddingConfig, queryEmbedding.length);
    } catch (error) {
      if (error instanceof RemoteEmbeddingError) {
        return [];
      }
      throw error;
    }

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const candidateLimit = Math.max(limit * 4, limit);
    const topResults: SemanticSearchResult[] = [];
    let cursor: string | undefined;

    while (true) {
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
          id: true,
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
        orderBy: {
          id: 'asc',
        },
        take: VECTOR_SEARCH_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (!rows.length) {
        break;
      }

      topResults.push(
        ...rows
          .map((row) => {
            const rowEmbedding = parseEmbedding(row.embedding);
            const similarity =
              rowEmbedding.length === queryEmbedding.length
                ? cosineSimilarity(queryEmbedding, rowEmbedding)
                : 0;

            return {
              chunkId: row.chunkId,
              bookId: row.chapter.bookId,
              chapterId: row.chapterId,
              bookTitle: row.chapter.book.title,
              chapterTitle: row.chapter.title,
              content: row.content,
              score: Math.round(Math.max(0, similarity) * 100),
            };
          })
          .filter((result) => result.score > 0),
      );
      topResults.sort((a, b) => b.score - a.score);
      topResults.length = Math.min(topResults.length, candidateLimit);
      cursor = rows[rows.length - 1]?.id;
    }

    return topResults.slice(0, limit);
  }

  private async ensureVectorIndexReady(
    embeddingConfig: EmbeddingConfig,
    expectedDimensions: number,
  ) {
    const key = [
      embeddingConfig.provider,
      embeddingConfig.model,
      embeddingConfig.endpointFingerprint,
      expectedDimensions,
    ].join(':');
    if (this.vectorReadyCheck?.key === key) {
      const currentCheck = this.vectorReadyCheck;
      await currentCheck.promise;
      if (currentCheck.generation !== this.indexGeneration) {
        await this.ensureIndexReady();
        await this.ensureVectorIndexReady(embeddingConfig, expectedDimensions);
      }
      return;
    }

    const generation = this.indexGeneration;
    const readinessCheck = this.enqueueIndexOperation(async () => {
      const [totalChunks, vectorChunks, currentVectorChunks] =
        await Promise.all([
          this.prisma.chapterChunk.count(),
          this.prisma.vectorData.count(),
          this.countCurrentVectorRows(embeddingConfig, expectedDimensions),
        ]);

      if (vectorChunks !== totalChunks || currentVectorChunks !== totalChunks) {
        await this.rebuildIndexUnsafe(embeddingConfig, expectedDimensions);
        if (generation === this.indexGeneration) {
          this.indexReadyChecked = true;
        }
      }
    });
    const promise = readinessCheck.finally(() => {
      if (this.vectorReadyCheck?.promise === promise) {
        this.vectorReadyCheck = undefined;
      }
    });
    this.vectorReadyCheck = { key, generation, promise };
    await promise;
    if (generation !== this.indexGeneration) {
      await this.ensureIndexReady();
      await this.ensureVectorIndexReady(embeddingConfig, expectedDimensions);
    }
  }

  private async getFtsIndexState(): Promise<FtsIndexState> {
    const rows = await this.prisma.$queryRawUnsafe<FtsIndexStateRow[]>(`
      SELECT
        (SELECT count(*) FROM "ChapterChunk") AS "totalChunks",
        (SELECT count(*) FROM "ChapterChunkFts") AS "ftsChunks",
        (
          SELECT count(*)
          FROM "ChapterChunk" AS chunk
          WHERE NOT EXISTS (
            SELECT 1
            FROM "ChapterChunkFts" AS fts
            WHERE fts."chunkId" = chunk."id"
          )
        ) AS "missingChunks",
        (
          SELECT count(*)
          FROM "ChapterChunkFts" AS fts
          WHERE NOT EXISTS (
            SELECT 1
            FROM "ChapterChunk" AS chunk
            WHERE chunk."id" = fts."chunkId"
          )
        ) AS "staleRows",
        (
          SELECT count(*)
          FROM "ChapterChunkFts" AS fts
          INNER JOIN "ChapterChunk" AS chunk ON chunk."id" = fts."chunkId"
          INNER JOIN "Chapter" AS chapter ON chapter."id" = chunk."chapterId"
          INNER JOIN "Book" AS book ON book."id" = chapter."bookId"
          WHERE fts."bookId" <> chapter."bookId"
             OR fts."chapterId" <> chapter."id"
             OR fts."bookTitle" <> book."title"
             OR fts."chapterTitle" <> chapter."title"
        ) AS "mismatchedRows"
    `);
    const state = rows[0];

    return {
      totalChunks: toCount(state?.totalChunks),
      ftsChunks: toCount(state?.ftsChunks),
      missingChunks: toCount(state?.missingChunks),
      staleRows: toCount(state?.staleRows),
      mismatchedRows: toCount(state?.mismatchedRows),
    };
  }

  private isFtsIndexConsistent(state: FtsIndexState) {
    return (
      state.ftsChunks === state.totalChunks &&
      state.missingChunks === 0 &&
      state.staleRows === 0 &&
      state.mismatchedRows === 0
    );
  }

  private async findCurrentVectorMetadata(embeddingConfig: EmbeddingConfig) {
    const rows =
      (await this.prisma.$queryRawUnsafe<VectorMetadataRow[]>(
        `SELECT "metadata"
         FROM "VectorData"
         WHERE json_extract(
                 CASE WHEN json_valid("metadata") = 1 THEN "metadata" ELSE '{}' END,
                 '$.embeddingProvider'
               ) = ?
           AND json_extract(
                 CASE WHEN json_valid("metadata") = 1 THEN "metadata" ELSE '{}' END,
                 '$.embeddingModel'
               ) = ?
           AND json_extract(
                 CASE WHEN json_valid("metadata") = 1 THEN "metadata" ELSE '{}' END,
                 '$.embeddingEndpoint'
               ) = ?
           AND json_extract(
                 CASE WHEN json_valid("metadata") = 1 THEN "metadata" ELSE '{}' END,
                 '$.embeddingDimensions'
               ) > 0
         ORDER BY "id" ASC
         LIMIT 1`,
        embeddingConfig.provider,
        embeddingConfig.model,
        embeddingConfig.endpointFingerprint,
      )) ?? [];
    return parseVectorMetadata(rows[0]?.metadata);
  }

  private async countCurrentVectorRows(
    embeddingConfig: EmbeddingConfig,
    expectedDimensions: number,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*) AS "count"
       FROM "VectorData" AS vector
       INNER JOIN "ChapterChunk" AS chunk ON chunk."id" = vector."chunkId"
       INNER JOIN "Chapter" AS chapter ON chapter."id" = vector."chapterId"
       INNER JOIN "Book" AS book ON book."id" = chapter."bookId"
       WHERE json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.embeddingProvider'
             ) = ?
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.embeddingModel'
             ) = ?
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.embeddingEndpoint'
             ) = ?
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.embeddingDimensions'
             ) = ?
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.bookId'
             ) = chapter."bookId"
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.bookTitle'
             ) = book."title"
         AND json_extract(
               CASE WHEN json_valid(vector."metadata") = 1 THEN vector."metadata" ELSE '{}' END,
               '$.chapterTitle'
             ) = chapter."title"
         AND vector."content" = chunk."content"
         AND json_valid(vector."embedding") = 1
         AND json_type(vector."embedding") = 'array'
         AND json_array_length(vector."embedding") = ?`,
      embeddingConfig.provider,
      embeddingConfig.model,
      embeddingConfig.endpointFingerprint,
      expectedDimensions,
      expectedDimensions,
    );
    return toCount(rows[0]?.count);
  }

  private enqueueIndexOperation<T>(operation: () => Promise<T>) {
    const result = this.indexOperationTail.then(operation, operation);
    this.indexOperationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private markIndexDirty() {
    this.indexReadyChecked = false;
    this.indexGeneration += 1;
    return this.indexGeneration;
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
        endpointFingerprint: 'local',
      };
    }

    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = normalizeRemoteBaseUrl(baseUrl);
    } catch {
      return {
        provider: 'local',
        model: 'local-hash-v1',
        endpointFingerprint: 'local',
      };
    }

    return {
      provider,
      model,
      baseUrl: normalizedBaseUrl,
      apiKey,
      endpointFingerprint:
        createEmbeddingEndpointFingerprint(normalizedBaseUrl),
    };
  }

  private async buildEmbeddings(
    texts: string[],
    config: EmbeddingConfig,
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    if (config.provider === 'local') {
      return {
        vectors: texts.map((text) => buildLocalEmbedding(text)),
        config,
      };
    }

    const vectors: number[][] = [];
    let vectorSize: number | undefined;

    for (
      let start = 0;
      start < texts.length;
      start += REMOTE_EMBEDDING_BATCH_SIZE
    ) {
      throwIfAborted(signal);
      const originalBatch = texts.slice(
        start,
        start + REMOTE_EMBEDDING_BATCH_SIZE,
      );
      const requestBatch = originalBatch.map((text) =>
        this.normalizeEmbeddingText(text),
      );

      const payload = await this.requestRemoteEmbeddings(
        requestBatch,
        config,
        signal,
      );
      const batchVectors = originalBatch.map((_, index) =>
        this.normalizeRemoteEmbedding(
          payload.data?.find((item) => item.index === index)?.embedding ??
            payload.data?.[index]?.embedding,
        ),
      );

      for (const vector of batchVectors) {
        vectorSize ??= vector.length;
        if (vector.length !== vectorSize) {
          throw new RemoteEmbeddingError(
            'Embedding response used inconsistent vector dimensions',
          );
        }
      }
      vectors.push(...batchVectors);
    }

    return {
      vectors,
      config,
    };
  }

  private async buildEmbedding(text: string, config: EmbeddingConfig) {
    if (config.provider === 'local') {
      return buildLocalEmbedding(text);
    }

    const payload = await this.requestRemoteEmbeddings(
      this.normalizeEmbeddingText(text),
      config,
    );
    return this.normalizeRemoteEmbedding(payload.data?.[0]?.embedding);
  }

  private async requestRemoteEmbeddings(
    input: string | string[],
    config: EmbeddingConfig,
    signal?: AbortSignal,
  ) {
    try {
      const timeoutSignal = createRemoteRequestSignal(
        process.env.AI_EMBEDDING_TIMEOUT_MS,
        DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS,
      );
      const response = await fetch(
        buildRemoteRequestUrl(config.baseUrl ?? '', 'embeddings'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + config.apiKey,
          },
          body: JSON.stringify({
            model: config.model,
            input,
          }),
          signal: signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal,
        },
      );

      if (!response.ok) {
        throw new RemoteEmbeddingError(
          'Embedding request failed with status ' + response.status,
        );
      }

      return (await response.json()) as EmbeddingResponse;
    } catch (error) {
      if (error instanceof RemoteEmbeddingError) {
        throw error;
      }
      throw new RemoteEmbeddingError('Embedding request failed', {
        cause: error,
      });
    }
  }

  private normalizeRemoteEmbedding(value: unknown) {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every(
        (item): item is number =>
          typeof item === 'number' && Number.isFinite(item),
      )
    ) {
      throw new RemoteEmbeddingError(
        'Embedding response did not include a valid numeric vector',
      );
    }

    return value;
  }

  private normalizeEmbeddingText(text: string) {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_REMOTE_EMBEDDING_TEXT_CHARS);
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Index operation cancelled');
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
  embeddingEndpoint?: string;
  embeddingDimensions?: number;
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
          embeddingEndpoint:
            typeof (parsed as Record<string, unknown>).embeddingEndpoint ===
            'string'
              ? ((parsed as Record<string, unknown>)
                  .embeddingEndpoint as string)
              : undefined,
          embeddingDimensions:
            typeof (parsed as Record<string, unknown>).embeddingDimensions ===
              'number' &&
            Number.isInteger(
              (parsed as Record<string, unknown>).embeddingDimensions,
            ) &&
            ((parsed as Record<string, unknown>)
              .embeddingDimensions as number) > 0
              ? ((parsed as Record<string, unknown>)
                  .embeddingDimensions as number)
              : undefined,
        }
      : {};
  } catch {
    return {};
  }
}

export function createEmbeddingEndpointFingerprint(baseUrl: string) {
  return createHash('sha256')
    .update(normalizeRemoteBaseUrl(baseUrl))
    .digest('hex')
    .slice(0, 16);
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
