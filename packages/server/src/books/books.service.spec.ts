import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContentIndexService } from '../content/content-index.service';

describe('BooksService', () => {
  let service: BooksService;
  const prisma = {
    book: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    chapter: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    readingProgress: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const contentIndex = {
    syncBook: jest.fn(),
    removeBook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ContentIndexService,
          useValue: contentIndex,
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('computes library stats from chapter progress', async () => {
    const firstDate = new Date('2026-06-01T08:00:00.000Z');
    const secondDate = new Date('2026-06-02T08:00:00.000Z');
    prisma.book.findMany.mockResolvedValue([
      {
        lastRead: secondDate,
        chapters: [
          {
            isRead: true,
            progress: 100,
            content: 'a'.repeat(900),
            updatedAt: firstDate,
            readingProgress: {
              readingSeconds: 60,
            },
          },
          {
            isRead: false,
            progress: 50,
            content: 'b'.repeat(900),
            updatedAt: secondDate,
            readingProgress: {
              readingSeconds: 125,
            },
          },
          {
            isRead: false,
            progress: 0,
            content: 'c'.repeat(900),
            updatedAt: secondDate,
            readingProgress: null,
          },
        ],
      },
    ]);

    await expect(service.getStats()).resolves.toEqual({
      totalBooks: 1,
      totalChapters: 3,
      completedChapters: 1,
      inProgressChapters: 1,
      readingSeconds: 185,
      readingMinutes: 3,
      estimatedReadingMinutes: 3,
      learningDays: 2,
      completionRate: 33.3,
      latestReadAt: secondDate,
    });
  });

  it('loads chapter reading progress with chapter details', async () => {
    prisma.chapter.findUnique.mockResolvedValue({
      id: 'chapter-1',
      bookId: 'book-1',
      readingProgress: {
        scrollPosition: 320,
        percentage: 42,
      },
    });

    await expect(
      service.findChapter('book-1', 'chapter-1'),
    ).resolves.toMatchObject({
      id: 'chapter-1',
      readingProgress: {
        scrollPosition: 320,
        percentage: 42,
      },
    });
    expect(prisma.chapter.findUnique).toHaveBeenCalledWith({
      where: { id: 'chapter-1' },
      include: {
        readingProgress: true,
      },
    });
  });

  it('increments bounded reading seconds when progress is updated', async () => {
    const updatedChapter = {
      id: 'chapter-1',
      bookId: 'book-1',
      progress: 100,
      isRead: true,
    };
    prisma.chapter.findFirst.mockResolvedValue({ id: 'chapter-1' });
    prisma.chapter.update.mockReturnValue(updatedChapter);
    prisma.readingProgress.upsert.mockReturnValue({ id: 'progress-1' });
    prisma.$transaction.mockResolvedValue([
      updatedChapter,
      { id: 'progress-1' },
    ]);

    await expect(
      service.updateProgress('book-1', 'chapter-1', 120, 420, 10_000),
    ).resolves.toBe(updatedChapter);

    expect(prisma.readingProgress.upsert).toHaveBeenCalledWith({
      where: { chapterId: 'chapter-1' },
      update: {
        percentage: 100,
        scrollPosition: 420,
        readingSeconds: { increment: 900 },
      },
      create: {
        chapterId: 'chapter-1',
        percentage: 100,
        scrollPosition: 420,
        readingSeconds: 900,
      },
    });
  });

  it('rebuilds the book index when its title changes', async () => {
    prisma.book.findUnique
      .mockResolvedValueOnce({ id: 'book-1', title: 'Old title' })
      .mockResolvedValueOnce({
        id: 'book-1',
        title: 'New title',
        tags: '[]',
        chapters: [],
      });
    prisma.book.update.mockResolvedValue({ id: 'book-1' });

    await expect(
      service.updateBook('book-1', { title: ' New title ' }),
    ).resolves.toMatchObject({
      id: 'book-1',
      title: 'New title',
    });

    expect(prisma.book.update).toHaveBeenCalledWith({
      where: { id: 'book-1' },
      data: {
        title: 'New title',
        indexPending: true,
        indexRevision: {
          increment: 1,
        },
      },
    });
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });

  it('does not expose internal index retry state in book responses', async () => {
    prisma.book.findMany.mockResolvedValue([
      {
        id: 'book-1',
        title: 'React',
        tags: '[]',
        indexPending: true,
        indexRevision: 3,
        chapters: [],
      },
    ]);

    const [book] = await service.findAll();

    expect(book).not.toHaveProperty('indexPending');
    expect(book).not.toHaveProperty('indexRevision');
  });

  it('removes the external indexes after deleting a book', async () => {
    prisma.book.findUnique.mockResolvedValue({ id: 'book-1' });
    prisma.book.delete.mockResolvedValue({ id: 'book-1' });

    await expect(service.deleteBook('book-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.book.delete).toHaveBeenCalledWith({
      where: { id: 'book-1' },
    });
    expect(contentIndex.removeBook).toHaveBeenCalledWith('book-1');
  });
});
