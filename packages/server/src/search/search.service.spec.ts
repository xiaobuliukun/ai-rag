import { SearchService } from './search.service';

describe('SearchService', () => {
  const prisma = {
    book: {
      findMany: jest.fn(),
    },
    chapter: {
      findMany: jest.fn(),
    },
    chapterChunk: {
      findMany: jest.fn(),
    },
  };

  let service: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SearchService(prisma as never);
  });

  it('returns no results for an empty query', async () => {
    await expect(service.search('   ')).resolves.toEqual([]);
    expect(prisma.book.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    expect(prisma.chapterChunk.findMany).not.toHaveBeenCalled();
  });

  it('combines and ranks book, chapter, and content matches', async () => {
    prisma.book.findMany.mockResolvedValue([
      {
        id: 'book-1',
        title: 'React Patterns',
        chapters: [
          { id: 'chapter-1', isRead: true },
          { id: 'chapter-2', isRead: false },
        ],
      },
    ]);
    prisma.chapter.findMany.mockResolvedValue([]);
    prisma.chapterChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        content:
          'This chapter explains React hooks, component state, and effects in detail.',
        chunkIndex: 0,
        chapter: {
          id: 'chapter-2',
          bookId: 'book-1',
          title: 'Hooks',
          book: {
            title: 'React Patterns',
          },
        },
      },
    ]);

    const results = await service.search('React');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      type: 'book',
      title: 'React Patterns',
      bookId: 'book-1',
    });
    expect(results[1]).toMatchObject({
      type: 'content',
      title: 'Hooks',
      chapterId: 'chapter-2',
      bookTitle: 'React Patterns',
    });
  });
});
