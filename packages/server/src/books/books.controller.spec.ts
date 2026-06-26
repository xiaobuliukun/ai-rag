import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

describe('BooksController', () => {
  let controller: BooksController;
  const booksService = {
    findAll: jest.fn(),
    getStats: jest.fn(),
    findOne: jest.fn(),
    findChapter: jest.fn(),
    updateProgress: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: booksService,
        },
      ],
    }).compile();

    controller = module.get<BooksController>(BooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns library stats', () => {
    const stats = {
      totalBooks: 1,
      totalChapters: 2,
      completedChapters: 1,
      inProgressChapters: 1,
      estimatedReadingMinutes: 12,
      learningDays: 1,
      completionRate: 50,
      latestReadAt: null,
    };
    booksService.getStats.mockReturnValue(stats);

    expect(controller.getStats()).toBe(stats);
  });
});
