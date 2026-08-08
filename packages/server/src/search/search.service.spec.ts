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
    getStatus: jest.fn(),
    search: jest.fn(),
    semanticSearch: jest.fn(),
  };

  let service: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.book.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    contentIndex.search.mockResolvedValue([]);
    contentIndex.semanticSearch.mockResolvedValue([]);
    service = new SearchService(prisma as never, contentIndex as never);
  });

  it('returns no results for an empty query', async () => {
    await expect(service.search('   ')).resolves.toEqual([]);
    expect(prisma.book.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    expect(contentIndex.search).not.toHaveBeenCalled();
    expect(contentIndex.semanticSearch).not.toHaveBeenCalled();
  });

  it('returns search index status', async () => {
    contentIndex.getStatus.mockResolvedValue({
      totalBooks: 1,
      totalChapters: 2,
      totalChunks: 3,
      ftsChunks: 3,
      vectorChunks: 3,
      isFtsReady: true,
      isVectorReady: true,
      embeddingProvider: 'local',
      embeddingModel: 'local-hash-v1',
    });

    await expect(service.getIndexStatus()).resolves.toMatchObject({
      totalChunks: 3,
      isFtsReady: true,
      isVectorReady: true,
    });
    expect(contentIndex.getStatus).toHaveBeenCalledTimes(1);
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
    contentIndex.semanticSearch.mockResolvedValue([]);
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
      expect.objectContaining({ limit: 80 }),
    );
    expect(contentIndex.semanticSearch).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'content',
      highlightedContent: '<mark>React</mark> hooks share stateful logic.',
    });
  });

  it('merges semantic-only matches into content results', async () => {
    contentIndex.search.mockResolvedValue([]);
    contentIndex.semanticSearch.mockResolvedValue([
      {
        chunkId: 'chunk-semantic',
        bookId: 'book-1',
        chapterId: 'chapter-3',
        bookTitle: '前端性能优化',
        chapterTitle: '渲染性能',
        content: '这一章讨论长列表性能、缓存策略和交互延迟。',
        score: 82,
      },
    ]);

    const results = await service.search('列表性能', undefined, 'content');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'content',
      title: '渲染性能',
      bookTitle: '前端性能优化',
      chapterId: 'chapter-3',
    });
    expect(results[0].highlightedContent).toContain('<mark>列表性能</mark>');
  });

  it('returns lexical results without waiting for an unresolved semantic request', async () => {
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
    contentIndex.semanticSearch.mockImplementation(
      () => new Promise<never>(() => undefined),
    );

    await expect(
      service.search('React', undefined, 'content'),
    ).resolves.toHaveLength(1);
    expect(contentIndex.semanticSearch).not.toHaveBeenCalled();
  });
});
