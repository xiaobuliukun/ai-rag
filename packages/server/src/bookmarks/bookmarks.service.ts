import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateBookmarkRequest,
  UpdateBookmarkRequest,
} from '@moxu/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookmarksService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter: { bookId?: string; chapterId?: string }) {
    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        ...(filter.bookId ? { bookId: filter.bookId } : {}),
        ...(filter.chapterId ? { chapterId: filter.chapterId } : {}),
      },
      include: {
        book: { select: { title: true } },
        chapter: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookmarks.map((bookmark) => ({
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
    }));
  }

  async create(request: CreateBookmarkRequest) {
    const note = request.note.trim();
    if (!note) {
      throw new BadRequestException('Bookmark note is required');
    }

    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: request.chapterId,
        bookId: request.bookId,
      },
      select: { id: true },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const bookmark = await this.prisma.bookmark.create({
      data: {
        bookId: request.bookId,
        chapterId: request.chapterId,
        note,
        excerpt: request.excerpt?.trim() || null,
        position: Math.min(100, Math.max(0, request.position ?? 0)),
      },
    });

    return bookmark;
  }

  async update(id: string, request: UpdateBookmarkRequest) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Bookmark not found');
    }

    const note = request.note?.trim();
    if (request.note !== undefined && !note) {
      throw new BadRequestException('Bookmark note is required');
    }

    return this.prisma.bookmark.update({
      where: { id },
      data: {
        ...(note ? { note } : {}),
        ...(request.excerpt !== undefined
          ? { excerpt: request.excerpt?.trim() || null }
          : {}),
        ...(request.position !== undefined
          ? { position: Math.min(100, Math.max(0, request.position)) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Bookmark not found');
    }

    await this.prisma.bookmark.delete({
      where: { id },
    });

    return { success: true };
  }
}
