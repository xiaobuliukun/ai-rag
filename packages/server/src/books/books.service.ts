import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  private withChapterStats<T extends { chapters: Array<{ isRead: boolean }> }>(
    book: T,
  ) {
    return {
      ...book,
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

  async findChapter(bookId: string, chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter || chapter.bookId !== bookId) {
      throw new NotFoundException(`Chapter not found`);
    }

    return chapter;
  }

  async updateProgress(bookId: string, chapterId: string, progress: number) {
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

    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        progress,
        isRead: progress >= 100,
        updatedAt: new Date(),
        book: {
          update: {
            lastRead: new Date(),
          },
        },
      },
    });
  }
}
