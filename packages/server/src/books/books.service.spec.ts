import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: PrismaService,
          useValue: prisma,
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
          },
          {
            isRead: false,
            progress: 50,
            content: 'b'.repeat(900),
            updatedAt: secondDate,
          },
          {
            isRead: false,
            progress: 0,
            content: 'c'.repeat(900),
            updatedAt: secondDate,
          },
        ],
      },
    ]);

    await expect(service.getStats()).resolves.toEqual({
      totalBooks: 1,
      totalChapters: 3,
      completedChapters: 1,
      inProgressChapters: 1,
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

    await expect(service.findChapter('book-1', 'chapter-1')).resolves.toMatchObject({
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
});
