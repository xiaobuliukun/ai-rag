import { SearchService } from './search.service';

describe('SearchService', () => {
  const prisma = {
    book: {
      findMany: jest.fn(),
    },
    chapter: {
      findMany: jest.fn(),
    },
  };
  const contentIndex = {
    search: jest.fn(),
  };

  let service: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SearchService(prisma as never, contentIndex as never);
  });

  it('returns no results for an empty query', async () => {
    await expect(service.search('   ')).resolves.toEqual([]);
    expect(prisma.book.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    expect(contentIndex.search).not.toHaveBeenCalled();
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
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-2',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks',
        content:
          'This chapter explains React hooks, component state, and effects in detail.',
        excerpt: 'This chapter explains React hooks.',
        highlightedExcerpt: 'This chapter explains <mark>React</mark> hooks.',
        score: 12,
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
      highlightedContent: 'This chapter explains <mark>React</mark> hooks.',
    });
  });

  it('can limit search to content results', async () => {
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks',
        content: 'React hooks share stateful logic.',
        excerpt: 'React hooks share stateful logic.',
        highlightedExcerpt: '<mark>React</mark> hooks share stateful logic.',
        score: 8,
      },
    ]);

    const results = await service.search('React', undefined, 'content');

    expect(prisma.book.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    expect(contentIndex.search).toHaveBeenCalledWith(
      'React',
      expect.objectContaining({ limit: 50 }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'content',
      highlightedContent: '<mark>React</mark> hooks share stateful logic.',
    });
  });
});
