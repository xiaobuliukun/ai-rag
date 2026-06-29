import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  BackupPayload,
  ImportBackupMode,
  ImportBackupRequest,
  ImportBackupResponse,
} from '@juejin-flow/shared';
import { Prisma } from '@prisma/client';
import { encryptSecret } from '../ai/secrets';
import { chunkMarkdownContent } from '../content/chunking';
import { ContentIndexService } from '../content/content-index.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_AI_CONFIG_ID = 'default';

@Injectable()
export class BackupService {
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
        ...book,
        tags: parseTags(book.tags),
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
    const { payload, mode } = normalizeImportRequest(request);

    if (!payload || payload.version !== 1 || !Array.isArray(payload.books)) {
      throw new BadRequestException('Unsupported backup payload');
    }

    if (mode === 'merge') {
      return this.mergeBackup(payload);
    }

    return this.replaceBackup(payload);
  }

  private async replaceBackup(
    payload: BackupPayload,
  ): Promise<ImportBackupResponse> {
    await this.prisma.$executeRawUnsafe('DELETE FROM "ChapterChunkFts"');

    await this.prisma.$transaction(async (tx) => {
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

    for (const book of payload.books) {
      await this.contentIndex.syncBook(book.id);
    }

    const chaptersImported = payload.books.reduce(
      (total, book) => total + (book.chapters?.length ?? 0),
      0,
    );

    return {
      success: true,
      message: `Imported ${payload.books.length} books, ${chaptersImported} chapters`,
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

    await this.prisma.$transaction(async (tx) => {
      for (const book of payload.books) {
        const [existingById, existingByPath] = await Promise.all([
          tx.book.findUnique({
            where: { id: book.id },
            select: { id: true },
          }),
          tx.book.findUnique({
            where: { path: book.path },
            select: { id: true },
          }),
        ]);
        const targetBookId = existingById?.id ?? existingByPath?.id ?? book.id;
        const canUpdatePath =
          !existingByPath || existingByPath.id === targetBookId;

        bookIdMap.set(book.id, targetBookId);
        affectedBookIds.add(targetBookId);

        if (existingById || existingByPath) {
          await tx.book.update({
            where: { id: targetBookId },
            data: {
              title: book.title,
              ...(canUpdatePath ? { path: book.path } : {}),
              description: book.description ?? null,
              tags: JSON.stringify(book.tags ?? []),
              coverImage: book.coverImage ?? null,
              lastRead: toDate(book.lastRead),
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

        await tx.bookmark.upsert({
          where: { id: bookmark.id },
          update: {
            bookId: targetBookId,
            chapterId: targetChapterId,
            note: bookmark.note,
            excerpt: bookmark.excerpt ?? null,
            position: bookmark.position,
          },
          create: {
            id: bookmark.id,
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
      }
    });

    for (const bookId of affectedBookIds) {
      await this.contentIndex.syncBook(bookId);
    }

    const chaptersImported = payload.books.reduce(
      (total, book) => total + (book.chapters?.length ?? 0),
      0,
    );

    return {
      success: true,
      message: `Merged ${payload.books.length} books, ${chaptersImported} chapters`,
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
    const existingById = await tx.chapter.findUnique({
      where: { id: chapter.id },
      select: { id: true },
    });
    const existingByFileName = existingById
      ? null
      : await tx.chapter.findUnique({
          where: {
            bookId_fileName: {
              bookId,
              fileName: chapter.fileName,
            },
          },
          select: { id: true },
        });
    const targetChapterId =
      existingById?.id ?? existingByFileName?.id ?? chapter.id;
    const chapterData = {
      bookId,
      title: chapter.title,
      fileName: chapter.fileName,
      content: chapter.content ?? null,
      orderIndex: chapter.orderIndex,
      isRead: chapter.isRead,
      progress: chapter.progress,
    };

    if (existingById || existingByFileName) {
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
      await tx.readingProgress.upsert({
        where: { chapterId: targetChapterId },
        update: {
          percentage: chapter.readingProgress.percentage,
          scrollPosition: chapter.readingProgress.scrollPosition,
          readingSeconds: chapter.readingProgress.readingSeconds ?? 0,
        },
        create: {
          id: chapter.readingProgress.id,
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

    return tx.aiConfig.upsert({
      where: { id: DEFAULT_AI_CONFIG_ID },
      update: {
        mode: aiConfig.mode,
        baseUrl: aiConfig.baseUrl ?? null,
        model: aiConfig.model ?? null,
        apiKey: encryptSecret(aiConfig.apiKey),
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
        apiKey: encryptSecret(aiConfig.apiKey),
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
}

function normalizeImportRequest(request: BackupPayload | ImportBackupRequest) {
  const maybeRequest = request as Partial<ImportBackupRequest>;
  const payload = maybeRequest.payload ?? (request as BackupPayload);
  const mode: ImportBackupMode = maybeRequest.payload
    ? maybeRequest.mode === 'replace'
      ? 'replace'
      : 'merge'
    : 'replace';

  return { payload, mode };
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
