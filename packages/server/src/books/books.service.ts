import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LibraryStats, UpdateBookRequest } from '@juejin-flow/shared';
import { PrismaService } from '../prisma/prisma.service';

const AVERAGE_READING_CHARS_PER_MINUTE = 450;

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  private withChapterStats<
    T extends { chapters: Array<{ isRead: boolean }>; tags?: string | null },
  >(book: T) {
    return {
      ...book,
      tags: parseTags(book.tags),
      totalChapters: book.chapters.length,
      readChapters: book.chapters.filter((chapter) => chapter.isRead).length,
    };
  }

  async findAll() {
    const books = await this.prisma.book.findMany({
      include: {
        chapters: {
          orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
          select: {
            id: true,
            bookId: true,
            title: true,
            fileName: true,
            orderIndex: true,
            isRead: true,
            progress: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        lastRead: 'desc',
      },
    });

    return books.map((book) => this.withChapterStats(book));
  }

  async getStats(): Promise<LibraryStats> {
    const books = await this.prisma.book.findMany({
      select: {
        lastRead: true,
        chapters: {
          select: {
            isRead: true,
            progress: true,
            content: true,
            updatedAt: true,
          },
        },
      },
    });

    const totalBooks = books.length;
    const chapters = books.flatMap((book) => book.chapters);
    const totalChapters = chapters.length;
    const completedChapters = chapters.filter((chapter) => chapter.isRead).length;
    const inProgressChapters = chapters.filter(
      (chapter) => !chapter.isRead && chapter.progress > 0,
    ).length;
    const learningDays = new Set(
      chapters
        .filter((chapter) => chapter.progress > 0 || chapter.isRead)
        .map((chapter) => toDayKey(chapter.updatedAt)),
    ).size;
    const latestReadAt =
      chapters
        .filter((chapter) => chapter.progress > 0 || chapter.isRead)
        .map((chapter) => chapter.updatedAt)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const estimatedReadingMinutes = Math.round(
      chapters.reduce((total, chapter) => {
        const progressRatio = Math.min(100, Math.max(0, chapter.progress)) / 100;
        const charCount = chapter.content?.trim().length ?? 0;
        return (
          total + (charCount / AVERAGE_READING_CHARS_PER_MINUTE) * progressRatio
        );
      }, 0),
    );

    return {
      totalBooks,
      totalChapters,
      completedChapters,
      inProgressChapters,
      estimatedReadingMinutes,
      learningDays,
      completionRate:
        totalChapters > 0
          ? Math.round((completedChapters / totalChapters) * 1000) / 10
          : 0,
      latestReadAt,
    };
  }

  async findOne(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
          select: {
            id: true,
            bookId: true,
            title: true,
            fileName: true,
            orderIndex: true,
            isRead: true,
            progress: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    return this.withChapterStats(book);
  }

  async updateBook(id: string, request: UpdateBookRequest) {
    const existing = await this.prisma.book.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    const title = request.title?.trim();
    if (request.title !== undefined && !title) {
      throw new BadRequestException('Title cannot be empty');
    }

    await this.prisma.book.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(request.description !== undefined
          ? { description: request.description?.trim() || null }
          : {}),
        ...(request.coverImage !== undefined
          ? { coverImage: request.coverImage?.trim() || null }
          : {}),
        ...(request.tags !== undefined
          ? { tags: JSON.stringify(normalizeTags(request.tags)) }
          : {}),
      },
    });

    return this.findOne(id);
  }

  async deleteBook(id: string) {
    const existing = await this.prisma.book.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    await this.prisma.book.delete({
      where: { id },
    });

    return { success: true };
  }

  async findChapter(bookId: string, chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        readingProgress: true,
      },
    });

    if (!chapter || chapter.bookId !== bookId) {
      throw new NotFoundException(`Chapter not found`);
    }

    return chapter;
  }

  async updateProgress(
    bookId: string,
    chapterId: string,
    progress: number,
    scrollPosition = 0,
  ) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        bookId,
      },
      select: {
        id: true,
      },
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter not found`);
    }

    const boundedProgress = Math.min(100, Math.max(0, progress));

    const [updatedChapter] = await this.prisma.$transaction([
      this.prisma.chapter.update({
        where: { id: chapterId },
        data: {
          progress: boundedProgress,
          isRead: boundedProgress >= 100,
          updatedAt: new Date(),
          book: {
            update: {
              lastRead: new Date(),
            },
          },
        },
      }),
      this.prisma.readingProgress.upsert({
        where: { chapterId },
        update: {
          percentage: boundedProgress,
          scrollPosition,
        },
        create: {
          chapterId,
          percentage: boundedProgress,
          scrollPosition,
        },
      }),
    ]);

    return updatedChapter;
  }
}

function toDayKey(value: Date) {
  return value.toISOString().slice(0, 10);
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

function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 12),
    ),
  );
}
