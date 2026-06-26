import { BadRequestException, Injectable } from '@nestjs/common';
import type { BackupPayload, ImportBackupResponse } from '@juejin-flow/shared';
import { encryptSecret } from '../ai/secrets';
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

  async importBackup(payload: BackupPayload): Promise<ImportBackupResponse> {
    if (!payload || payload.version !== 1 || !Array.isArray(payload.books)) {
      throw new BadRequestException('Unsupported backup payload');
    }

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
              data: chapter.chunks.map((chunk) => ({
                chapterId: chapter.id,
                chunkIndex: chunk.chunkIndex,
                content: chunk.content,
                charCount: chunk.charCount,
              })),
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
