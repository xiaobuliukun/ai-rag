import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.book.findMany({
      include: {
        _count: {
          select: { chapters: true },
        },
      },
      orderBy: {
        lastRead: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: {
            fileName: 'asc', // Or add an index field for proper ordering
          },
          select: {
            id: true,
            title: true,
            fileName: true,
            isRead: true,
            progress: true,
            // Exclude content for list view to save bandwidth
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    return book;
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

  async updateProgress(chapterId: string, progress: number) {
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
