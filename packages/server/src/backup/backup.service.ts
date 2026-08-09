import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { REPLACE_BACKUP_CONFIRMATION } from '@moxu/shared';
import type {
  BackupPayload,
  ImportBackupMode,
  ImportBackupRequest,
  ImportBackupResponse,
} from '@moxu/shared';
import { Prisma } from '@prisma/client';
import { encryptSecret } from '../ai/secrets';
import { chunkMarkdownContent } from '../content/chunking';
import { ContentIndexService } from '../content/content-index.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_AI_CONFIG_ID = 'default';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  async exportBackup(): Promise<BackupPayload> {
    const [books, bookmarks, aiConfig] = await Promise.all([
      this.prisma.book.findMany({
        include: {
          chapters: {
            include: {
              readingProgress: true,
              chunks: {
                select: {
                  chunkIndex: true,
                  content: true,
                  charCount: true,
                },
                orderBy: { chunkIndex: 'asc' },
              },
            },
            orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
          },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.bookmark.findMany({
        include: {
          book: { select: { title: true } },
          chapter: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiConfig.findUnique({
        where: { id: DEFAULT_AI_CONFIG_ID },
      }),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      books: books.map((book) => ({
        id: book.id,
        title: book.title,
        path: book.path,
        description: book.description,
        tags: parseTags(book.tags),
        coverImage: book.coverImage,
        lastRead: book.lastRead,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        chapters: book.chapters,
      })),
      bookmarks: bookmarks.map((bookmark) => ({
        id: bookmark.id,
        bookId: bookmark.bookId,
        chapterId: bookmark.chapterId,
        note: bookmark.note,
        excerpt: bookmark.excerpt,
        position: bookmark.position,
        createdAt: bookmark.createdAt,
        updatedAt: bookmark.updatedAt,
        bookTitle: bookmark.book.title,
        chapterTitle: bookmark.chapter.title,
      })),
      aiConfig: aiConfig
        ? {
            id: aiConfig.id,
            mode:
              aiConfig.mode === 'openai-compatible'
                ? 'openai-compatible'
                : 'local',
            baseUrl: aiConfig.baseUrl ?? undefined,
            model: aiConfig.model ?? undefined,
            apiKey: undefined,
            embeddingProvider:
              aiConfig.embeddingProvider === 'openai-compatible'
                ? 'openai-compatible'
                : 'local',
            embeddingModel: aiConfig.embeddingModel ?? undefined,
            ragSourceCount: aiConfig.ragSourceCount,
            ragContextChars: aiConfig.ragContextChars,
            ragExcerptChars: aiConfig.ragExcerptChars,
            updatedAt: aiConfig.updatedAt,
          }
        : null,
    };
  }

  async importBackup(
    request: BackupPayload | ImportBackupRequest,
  ): Promise<ImportBackupResponse> {
    const { payload, mode, replaceConfirmation } =
      normalizeImportRequest(request);

    if (!payload || payload.version !== 1 || !Array.isArray(payload.books)) {
      throw new BadRequestException('Unsupported backup payload');
    }
    assertUniqueBackupIds(payload);

    if (mode === 'merge') {
      return this.mergeBackup(payload);
    }

    if (replaceConfirmation !== REPLACE_BACKUP_CONFIRMATION) {
      throw new BadRequestException(
        'Replace import requires explicit confirmation',
      );
    }

    return this.replaceBackup(payload);
  }

  private async replaceBackup(
    payload: BackupPayload,
  ): Promise<ImportBackupResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM "ChapterChunkFts"');
      await tx.vectorData.deleteMany();
      await tx.chapterChunk.deleteMany();
      await tx.bookmark.deleteMany();
      await tx.readingProgress.deleteMany();
      await tx.chapter.deleteMany();
      await tx.book.deleteMany();
      await tx.aiConfig.deleteMany();

      for (const book of payload.books) {
        await tx.book.create({
          data: {
            id: book.id,
            title: book.title,
            path: book.path,
            description: book.description ?? null,
            tags: JSON.stringify(book.tags ?? []),
            coverImage: book.coverImage ?? null,
            lastRead: toDate(book.lastRead),
            indexPending: true,
            indexRevision: 1,
            createdAt: book.createdAt ? toDate(book.createdAt) : undefined,
          },
        });

        for (const chapter of book.chapters ?? []) {
          await tx.chapter.create({
            data: {
              id: chapter.id,
              bookId: book.id,
              title: chapter.title,
              fileName: chapter.fileName,
              content: chapter.content ?? null,
              orderIndex: chapter.orderIndex,
              isRead: chapter.isRead,
              progress: chapter.progress,
              createdAt: chapter.createdAt
                ? toDate(chapter.createdAt)
                : undefined,
            },
          });

          if (chapter.chunks?.length) {
            await tx.chapterChunk.createMany({
              data: buildChunkRows(chapter.id, chapter.content, chapter.chunks),
            });
          } else if (chapter.content) {
            await tx.chapterChunk.createMany({
              data: buildChunkRows(chapter.id, chapter.content),
            });
          }

          if (chapter.readingProgress) {
            await tx.readingProgress.create({
              data: {
                id: chapter.readingProgress.id,
                chapterId: chapter.id,
                percentage: chapter.readingProgress.percentage,
                scrollPosition: chapter.readingProgress.scrollPosition,
                readingSeconds: chapter.readingProgress.readingSeconds ?? 0,
              },
            });
          }
        }
      }

      for (const bookmark of payload.bookmarks ?? []) {
        await tx.bookmark.create({
          data: {
            id: bookmark.id,
            bookId: bookmark.bookId,
            chapterId: bookmark.chapterId,
            note: bookmark.note,
            excerpt: bookmark.excerpt ?? null,
            position: bookmark.position,
            createdAt: toDate(bookmark.createdAt),
          },
        });
      }

      if (payload.aiConfig) {
        await tx.aiConfig.create({
          data: {
            id: DEFAULT_AI_CONFIG_ID,
            mode: payload.aiConfig.mode,
            baseUrl: payload.aiConfig.baseUrl ?? null,
            model: payload.aiConfig.model ?? null,
            apiKey: encryptSecret(payload.aiConfig.apiKey),
            embeddingProvider:
              payload.aiConfig.embeddingProvider === 'openai-compatible'
                ? 'openai-compatible'
                : 'local',
            embeddingModel: payload.aiConfig.embeddingModel ?? null,
            ragSourceCount: payload.aiConfig.ragSourceCount ?? 5,
            ragContextChars: payload.aiConfig.ragContextChars ?? 12000,
            ragExcerptChars: payload.aiConfig.ragExcerptChars ?? 520,
          },
        });
      }
    });

    const chaptersImported = payload.books.reduce(
      (total, book) => total + (book.chapters?.length ?? 0),
      0,
    );
    let rebuildFailed = false;

    if (payload.books.length > 0) {
      try {
        await this.contentIndex.rebuildIndex();
      } catch (error) {
        rebuildFailed = true;
        this.logIndexingFailure(
          'Backup replacement was committed, but rebuilding the search index failed',
          error,
        );
      }
    }

    const indexPending =
      rebuildFailed ||
      (payload.books.length > 0 &&
        (await this.hasPendingIndexWork(payload.books.map((book) => book.id))));
    const summary =
      `Replaced the current library with ${payload.books.length} books, ` +
      `${chaptersImported} chapters.`;

    return {
      success: true,
      indexPending,
      message: indexPending
        ? `${summary} The replacement is committed, but search indexing is pending and will be retried. ` +
          'AI API keys are not included in backups and must be entered again.'
        : `${summary} AI API keys are not included in backups and must be entered again.`,
      booksImported: payload.books.length,
      chaptersImported,
      bookmarksImported: payload.bookmarks?.length ?? 0,
    };
  }

  private async mergeBackup(
    payload: BackupPayload,
  ): Promise<ImportBackupResponse> {
    const affectedBookIds = new Set<string>();
    const bookIdMap = new Map<string, string>();
    const chapterIdMap = new Map<string, string>();

    const globalIndexBookCount = await this.prisma.$transaction(async (tx) => {
      for (const book of payload.books) {
        const [existingByPath, existingById] = await Promise.all([
          tx.book.findUnique({
            where: { path: book.path },
            select: { id: true },
          }),
          tx.book.findUnique({
            where: { id: book.id },
            select: { id: true, path: true },
          }),
        ]);
        const targetBookId = existingByPath
          ? existingByPath.id
          : existingById
            ? stableImportedId('book', book.id, book.path)
            : book.id;

        bookIdMap.set(book.id, targetBookId);
        affectedBookIds.add(targetBookId);

        if (existingByPath) {
          await tx.book.update({
            where: { id: targetBookId },
            data: {
              title: book.title,
              path: book.path,
              description: book.description ?? null,
              tags: JSON.stringify(book.tags ?? []),
              coverImage: book.coverImage ?? null,
              lastRead: toDate(book.lastRead),
              indexPending: true,
              indexRevision: { increment: 1 },
            },
          });
        } else {
          await tx.book.create({
            data: {
              id: targetBookId,
              title: book.title,
              path: book.path,
              description: book.description ?? null,
              tags: JSON.stringify(book.tags ?? []),
              coverImage: book.coverImage ?? null,
              lastRead: toDate(book.lastRead),
              indexPending: true,
              indexRevision: 1,
              createdAt: book.createdAt ? toDate(book.createdAt) : undefined,
            },
          });
        }

        for (const chapter of book.chapters ?? []) {
          const targetChapterId = await this.upsertMergedChapter(
            tx,
            targetBookId,
            chapter,
          );
          chapterIdMap.set(chapter.id, targetChapterId);
        }
      }

      for (const bookmark of payload.bookmarks ?? []) {
        const targetBookId = bookIdMap.get(bookmark.bookId);
        const targetChapterId = chapterIdMap.get(bookmark.chapterId);

        if (!targetBookId || !targetChapterId) {
          continue;
        }

        const existingBookmark = await tx.bookmark.findUnique({
          where: { id: bookmark.id },
          select: { bookId: true, chapterId: true },
        });
        const targetBookmarkId =
          existingBookmark &&
          (existingBookmark.bookId !== targetBookId ||
            existingBookmark.chapterId !== targetChapterId)
            ? stableImportedId(
                'bookmark',
                bookmark.id,
                targetBookId,
                targetChapterId,
              )
            : bookmark.id;

        await tx.bookmark.upsert({
          where: { id: targetBookmarkId },
          update: {
            bookId: targetBookId,
            chapterId: targetChapterId,
            note: bookmark.note,
            excerpt: bookmark.excerpt ?? null,
            position: bookmark.position,
          },
          create: {
            id: targetBookmarkId,
            bookId: targetBookId,
            chapterId: targetChapterId,
            note: bookmark.note,
            excerpt: bookmark.excerpt ?? null,
            position: bookmark.position,
            createdAt: toDate(bookmark.createdAt),
          },
        });
      }

      if (payload.aiConfig) {
        await this.upsertAiConfig(tx, payload);
        const marked = await tx.book.updateMany({
          data: {
            indexPending: true,
            indexRevision: { increment: 1 },
          },
        });
        return marked.count;
      }

      return 0;
    });

    let indexingFailed = false;
    if (globalIndexBookCount > 0) {
      try {
        await this.contentIndex.rebuildIndex();
      } catch (error) {
        indexingFailed = true;
        this.logIndexingFailure(
          'Backup merge changed the global AI configuration, but rebuilding the search index failed',
          error,
        );
      }
    } else {
      for (const bookId of affectedBookIds) {
        try {
          await this.contentIndex.syncBook(bookId);
        } catch (error) {
          indexingFailed = true;
          this.logIndexingFailure(
            `Backup merge was committed, but indexing book ${bookId} failed`,
            error,
          );
        }
      }
    }

    const chaptersImported = payload.books.reduce(
      (total, book) => total + (book.chapters?.length ?? 0),
      0,
    );

    const affectedIds = [...affectedBookIds];
    const indexPending =
      indexingFailed ||
      (globalIndexBookCount > 0
        ? await this.hasPendingIndexWork()
        : affectedIds.length > 0 &&
          (await this.hasPendingIndexWork(affectedIds)));
    const summary = `Merged ${payload.books.length} books, ${chaptersImported} chapters.`;

    return {
      success: true,
      indexPending,
      message: indexPending
        ? `${summary} The data import is committed, but search indexing is pending and will be retried.`
        : summary,
      booksImported: payload.books.length,
      chaptersImported,
      bookmarksImported: payload.bookmarks?.length ?? 0,
    };
  }

  private async upsertMergedChapter(
    tx: Prisma.TransactionClient,
    bookId: string,
    chapter: BackupPayload['books'][number]['chapters'][number],
  ) {
    const [existingByFileName, existingById] = await Promise.all([
      tx.chapter.findUnique({
        where: {
          bookId_fileName: {
            bookId,
            fileName: chapter.fileName,
          },
        },
        select: { id: true },
      }),
      tx.chapter.findUnique({
        where: { id: chapter.id },
        select: { id: true, bookId: true, fileName: true },
      }),
    ]);
    const targetChapterId = existingByFileName
      ? existingByFileName.id
      : existingById
        ? stableImportedId('chapter', chapter.id, bookId, chapter.fileName)
        : chapter.id;
    const chapterData = {
      bookId,
      title: chapter.title,
      fileName: chapter.fileName,
      content: chapter.content ?? null,
      orderIndex: chapter.orderIndex,
      isRead: chapter.isRead,
      progress: chapter.progress,
    };

    if (existingByFileName) {
      await tx.chapter.update({
        where: { id: targetChapterId },
        data: chapterData,
      });
    } else {
      await tx.chapter.create({
        data: {
          id: targetChapterId,
          ...chapterData,
          createdAt: chapter.createdAt ? toDate(chapter.createdAt) : undefined,
        },
      });
    }

    await tx.vectorData.deleteMany({
      where: { chapterId: targetChapterId },
    });
    await tx.chapterChunk.deleteMany({
      where: { chapterId: targetChapterId },
    });

    const chunkRows = buildChunkRows(
      targetChapterId,
      chapter.content,
      chapter.chunks,
    );
    if (chunkRows.length) {
      await tx.chapterChunk.createMany({ data: chunkRows });
    }

    if (chapter.readingProgress) {
      const [existingProgressForChapter, existingProgressById] =
        await Promise.all([
          tx.readingProgress.findUnique({
            where: { chapterId: targetChapterId },
            select: { id: true },
          }),
          tx.readingProgress.findUnique({
            where: { id: chapter.readingProgress.id },
            select: { chapterId: true },
          }),
        ]);
      const targetProgressId = existingProgressForChapter
        ? existingProgressForChapter.id
        : existingProgressById &&
            existingProgressById.chapterId !== targetChapterId
          ? stableImportedId(
              'reading-progress',
              chapter.readingProgress.id,
              targetChapterId,
            )
          : chapter.readingProgress.id;

      await tx.readingProgress.upsert({
        where: { chapterId: targetChapterId },
        update: {
          percentage: chapter.readingProgress.percentage,
          scrollPosition: chapter.readingProgress.scrollPosition,
          readingSeconds: chapter.readingProgress.readingSeconds ?? 0,
        },
        create: {
          id: targetProgressId,
          chapterId: targetChapterId,
          percentage: chapter.readingProgress.percentage,
          scrollPosition: chapter.readingProgress.scrollPosition,
          readingSeconds: chapter.readingProgress.readingSeconds ?? 0,
        },
      });
    }

    return targetChapterId;
  }

  private upsertAiConfig(tx: Prisma.TransactionClient, payload: BackupPayload) {
    const aiConfig = payload.aiConfig;
    if (!aiConfig) {
      return Promise.resolve();
    }
    const encryptedApiKey = encryptSecret(aiConfig.apiKey);

    return tx.aiConfig.upsert({
      where: { id: DEFAULT_AI_CONFIG_ID },
      update: {
        mode: aiConfig.mode,
        baseUrl: aiConfig.baseUrl ?? null,
        model: aiConfig.model ?? null,
        ...(encryptedApiKey ? { apiKey: encryptedApiKey } : {}),
        embeddingProvider:
          aiConfig.embeddingProvider === 'openai-compatible'
            ? 'openai-compatible'
            : 'local',
        embeddingModel: aiConfig.embeddingModel ?? null,
        ragSourceCount: aiConfig.ragSourceCount ?? 5,
        ragContextChars: aiConfig.ragContextChars ?? 12000,
        ragExcerptChars: aiConfig.ragExcerptChars ?? 520,
      },
      create: {
        id: DEFAULT_AI_CONFIG_ID,
        mode: aiConfig.mode,
        baseUrl: aiConfig.baseUrl ?? null,
        model: aiConfig.model ?? null,
        apiKey: encryptedApiKey,
        embeddingProvider:
          aiConfig.embeddingProvider === 'openai-compatible'
            ? 'openai-compatible'
            : 'local',
        embeddingModel: aiConfig.embeddingModel ?? null,
        ragSourceCount: aiConfig.ragSourceCount ?? 5,
        ragContextChars: aiConfig.ragContextChars ?? 12000,
        ragExcerptChars: aiConfig.ragExcerptChars ?? 520,
      },
    });
  }

  private async hasPendingIndexWork(bookIds?: string[]) {
    try {
      return (
        (await this.prisma.book.count({
          where: {
            indexPending: true,
            ...(bookIds ? { id: { in: bookIds } } : {}),
          },
        })) > 0
      );
    } catch (error) {
      this.logIndexingFailure(
        'Unable to confirm whether imported books still require indexing',
        error,
      );
      return true;
    }
  }

  private logIndexingFailure(message: string, error: unknown) {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : String(error),
    );
  }
}

function normalizeImportRequest(request: BackupPayload | ImportBackupRequest) {
  const maybeRequest = request as Partial<ImportBackupRequest>;
  const payload = maybeRequest.payload ?? (request as BackupPayload);
  const mode: ImportBackupMode = maybeRequest.payload
    ? maybeRequest.mode === 'replace'
      ? 'replace'
      : 'merge'
    : 'merge';

  return {
    payload,
    mode,
    replaceConfirmation: maybeRequest.payload
      ? maybeRequest.replaceConfirmation
      : undefined,
  };
}

function assertUniqueBackupIds(payload: BackupPayload) {
  const bookIds = new Set<string>();
  const bookPaths = new Set<string>();
  const chapterIds = new Set<string>();
  const chapterBookIds = new Map<string, string>();

  for (const book of payload.books) {
    assertUniqueValue(bookIds, book.id, 'book id');
    assertUniqueValue(bookPaths, book.path, 'book path');
    const chapterFileNames = new Set<string>();

    for (const chapter of book.chapters ?? []) {
      assertUniqueValue(chapterIds, chapter.id, 'chapter id');
      assertUniqueValue(
        chapterFileNames,
        chapter.fileName,
        `chapter file name in book ${book.id}`,
      );
      if (chapter.bookId !== book.id) {
        throw new BadRequestException(
          `Backup chapter ${chapter.id} must belong to book ${book.id}`,
        );
      }
      chapterBookIds.set(chapter.id, book.id);
    }
  }

  const bookmarkIds = new Set<string>();
  for (const bookmark of payload.bookmarks ?? []) {
    assertUniqueValue(bookmarkIds, bookmark.id, 'bookmark id');
    if (!bookIds.has(bookmark.bookId) || !chapterIds.has(bookmark.chapterId)) {
      throw new BadRequestException(
        `Backup bookmark ${bookmark.id} must reference a book and chapter in the backup`,
      );
    }
    if (chapterBookIds.get(bookmark.chapterId) !== bookmark.bookId) {
      throw new BadRequestException(
        `Backup bookmark ${bookmark.id} chapter must belong to book ${bookmark.bookId}`,
      );
    }
  }
}

function assertUniqueValue(seen: Set<string>, value: string, label: string) {
  if (seen.has(value)) {
    throw new BadRequestException(`Duplicate backup ${label}: ${value}`);
  }
  seen.add(value);
}

function stableImportedId(kind: string, ...parts: string[]) {
  const digest = createHash('sha256')
    .update([kind, ...parts].join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `imported_${kind}_${digest}`;
}

function buildChunkRows(
  chapterId: string,
  content?: string | null,
  chunks?: BackupPayload['books'][number]['chapters'][number]['chunks'],
) {
  const sourceChunks =
    chunks?.length && chunks.every((chunk) => typeof chunk.content === 'string')
      ? chunks
      : chunkMarkdownContent(content ?? '');

  return sourceChunks.map((chunk) => ({
    chapterId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    charCount: chunk.charCount,
  }));
}

function parseTags(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}
